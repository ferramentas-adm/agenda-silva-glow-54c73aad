// POST /silva-agendar — cria agendamento pelo SDR IA (João Amorim).
// Com slot_id contendo closer, atribui imediatamente e reutiliza google-create-event.
// Sem closer no slot, preserva o fallback na fila "Aguardando atribuição".
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  BOOKING_MIN_LEAD_MINUTES, isWithinTurmaBWindow, loadDayAvailability, sdrIaOverbookingPosition,
  TURMA_A_MAX_PER_HOUR, TURMA_B_MAX_PER_HOUR, TURMA_B_WINDOW_END_HOUR, TURMA_B_WINDOW_START_HOUR,
  spParts, suggestFreeCloser, toSpIso,
} from "../_shared/disponibilidade.ts";
import { errorDetail } from "../_shared/erro.ts";
import { ensureLeadTag, fetchMetaLeadId } from "../_shared/datacrazyLead.ts";

const SDR_IA_EMAIL = "joao.amorim.ia@ogruposilva.com.br";
const SDR_IA_NAME = "João Amorim";
const BOOKING_CHANNEL = "sdr-ia";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  slot_id: z.string().min(1).optional(),
  inicio: z.string().min(1).optional(),
  lead_whatsapp: z.string().min(10).max(20),
  nome: z.string().min(1).max(200),
  sdr: z.string().optional().default(SDR_IA_NAME),
  origem: z.string().optional().default(BOOKING_CHANNEL),
  canal: z.string().optional().default("Tráfego Pago"),
  funil: z.enum(["formulario", "vsl-direta", "diretor"]).optional(),
  decisor_presente: z.union([z.boolean(), z.string().min(1)]).optional().transform((value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalized !== "nao";
  }),
  briefing: z.string().max(5000).optional(),
  crm_lead_id: z.string().max(100).optional(),
  crm_conversation_id: z.string().max(100).optional(),
  idempotency_key: z.string().min(1).max(200).optional(),
  lead_desqualificado: z.union([z.boolean(), z.string().min(1)]).optional().transform((value) => {
    if (typeof value !== "string") return value ?? false;
    const n = value.trim().toLocaleLowerCase("pt-BR");
    return n === "true" || n === "1" || n === "sim";
  }),
  email: z.string().email().optional(),
  // Roda todas as validações e devolve o desfecho sem gravar nada.
  dry_run: z.boolean().optional().default(false),
});

const normalizePhone = (p: string) => {
  let d = p.replace(/\D/g, "");
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  return d;
};

async function toResponse(supabase: ReturnType<typeof createClient>, a: Record<string, unknown>) {
  const inicio = toSpIso(new Date(`${a.scheduled_date}T${String(a.scheduled_time).slice(0, 5)}:00-03:00`));
  let closerName: string | null = null;
  if (typeof a.closer_id === "string" && a.closer_id) {
    const { data: closer } = await supabase.from("closers").select("name").eq("id", a.closer_id).maybeSingle();
    closerName = closer?.name ?? null;
  }
  return {
    agendamento_id: a.id,
    data: a.scheduled_date,
    hora: String(a.scheduled_time).slice(0, 5),
    inicio,
    status: a.status,
    closer: closerName,
    link_reuniao: a.meet_link ?? null,
    // Quando a reunião nasce sem link, o motivo real do Google vem aqui.
    link_erro: a.meet_link ? null : ((a.meet_error as string | null) ?? null),
    aviso: a.closer_id && !a.meet_link
      ? "Reunião criada SEM link do Meet. Trate manualmente ou remarque com outro closer."
      : null,
    fila_atribuicao: !a.closer_id,
    lead: { nome: a.lead_name, whatsapp: a.lead_phone },
    canal_agendamento: a.booking_channel,
    crm_lead_id: a.crm_lead_id ?? null,
    meta_lead_id: a.meta_lead_id ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;
  if (!b.slot_id && !b.inicio) return json({ erro: "informe slot_id ou inicio" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // 0) Idempotência
    if (b.idempotency_key) {
      const { data: prev } = await supabase.from("agendamentos").select("*")
        .eq("idempotency_key", b.idempotency_key).is("deleted_at", null).maybeSingle();
      if (prev) return json({ ...(await toResponse(supabase, prev)), idempotente: true }, 200);
    }

    // 1) Resolver início / closer sugerido
    let isoStart = b.inicio ?? "";
    let requestedCloserId: string | null = null;
    if (b.slot_id) {
      const parts = b.slot_id.split("|");
      if (parts.length > 2 || !parts[0]) {
        return json({ erro: "payload_invalido", campos: { slot_id: ["Formato inválido"] } }, 400);
      }
      const [iso, closerId] = parts;
      isoStart = iso;
      if (closerId && !z.string().uuid().safeParse(closerId).success) {
        return json({ erro: "payload_invalido", campos: { slot_id: ["closer_id inválido"] } }, 400);
      }
      requestedCloserId = closerId || null;
    }
    const start = new Date(isoStart);
    if (Number.isNaN(start.getTime())) return json({ erro: "inicio_invalido" }, 400);
    if (b.slot_id && b.inicio) {
      const explicitStart = new Date(b.inicio);
      if (Number.isNaN(explicitStart.getTime()) || explicitStart.getTime() !== start.getTime()) {
        return json({ erro: "payload_invalido", campos: { inicio: ["Não corresponde ao slot_id"] } }, 400);
      }
    }
    const now = new Date();
    if (start.getTime() < now.getTime() + BOOKING_MIN_LEAD_MINUTES * 60_000) {
      return json({ erro: "horario_no_passado" }, 409);
    }
    const p = spParts(start);
    if (p.minute !== 0) return json({ erro: "horario_fora_da_grade", detalhe: "use horas cheias" }, 409);
    const dateStr = p.dateStr;
    const timeStr = `${String(p.hour).padStart(2, "0")}:00`;

    // 2) Usuário SDR IA
    const { data: sdrProfile } = await supabase.from("profiles").select("user_id, full_name")
      .eq("email", SDR_IA_EMAIL).maybeSingle();
    if (!sdrProfile) return json({ erro: "sdr_ia_nao_configurado", detalhe: "execute /sdr-ia-setup" }, 500);

    // 3) Telefone já agendado (ativo, futuro ou hoje)
    const phone = normalizePhone(b.lead_whatsapp);
    const todayStr = spParts(now).dateStr;
    const { data: dup } = await supabase.from("agendamentos").select("id, scheduled_date, scheduled_time, status")
      .eq("lead_phone", phone).is("deleted_at", null)
      .in("status", ["pendente", "agendada", "confirmada", "nao_confirmada"])
      .gte("scheduled_date", todayStr).limit(1);
    if (dup && dup.length) {
      return json({ erro: "telefone_ja_agendado", agendamento: dup[0] }, 409);
    }

    // 4) Revalidar slot com a capacidade exclusiva do SDR IA (+3 por hora).
    const turma: "A" | "B" = b.lead_desqualificado ? "B" : "A";
    const avail = await loadDayAvailability(supabase, dateStr, undefined, turma);
    if (turma === "B" && !isWithinTurmaBWindow(timeStr)) {
      return json({
        erro: "fora_da_janela_turma_b",
        detalhe: `Lead desqualificado só pode ser agendado entre ${TURMA_B_WINDOW_START_HOUR}h e ${TURMA_B_WINDOW_END_HOUR}h; horário pedido: ${timeStr}`,
      }, 409);
    }
    if (!avail.slots.includes(timeStr)) return json({ erro: "horario_fora_da_grade" }, 409);
    const info = avail.hours.get(timeStr);
    if (turma === "A" && info && info.count >= TURMA_A_MAX_PER_HOUR) {
      return json({
        erro: "turma_a_lotada",
        detalhe: `Turma A já tem ${info.count} reuniões às ${timeStr} (teto de ${TURMA_A_MAX_PER_HOUR} por horário)`,
      }, 409);
    }
    if (turma === "B" && info && info.count >= TURMA_B_MAX_PER_HOUR) {
      return json({
        erro: "turma_b_lotada",
        detalhe: `Turma B já tem ${info.count} reuniões às ${timeStr} (teto de ${TURMA_B_MAX_PER_HOUR} por horário)`,
      }, 409);
    }
    if (!info || info.full || info.eligibleClosers.length === 0) {
      return json({ erro: "slot_indisponivel" }, 409);
    }
    let assignedCloserName: string | null = null;
    let fallbackSuggestedName: string | null = null;
    let closerDoSlotRespeitado: boolean | null = b.slot_id ? true : null;
    let motivoRealocacao: string | null = null;
    if (requestedCloserId) {
      // TRAVA DE SEGURANÇA: compromisso/bloqueio nunca é removido nem sobrescrito.
      if (info.blockedCloserIds.has(requestedCloserId)) {
        const { data: blocked } = await supabase.from("closers").select("name").eq("id", requestedCloserId).maybeSingle();
        motivoRealocacao = `${blocked?.name ?? "O closer do slot"} tem compromisso/bloqueio às ${timeStr} de ${dateStr}`;
        requestedCloserId = null;
      } else {
        assignedCloserName = info.eligibleClosers.find((c) => c.id === requestedCloserId)?.name ?? null;
        if (!assignedCloserName) {
          motivoRealocacao = `O closer do slot ficou indisponível às ${timeStr} de ${dateStr}`;
          requestedCloserId = null;
        }
      }
    }
    if (!requestedCloserId) {
      // Nunca terminar em "pendente": realoca para outro closer livre ou recusa.
      const alt = suggestFreeCloser(avail, timeStr);
      if (!alt) {
        return json({
          erro: "slot_bloqueado",
          detalhe: `${motivoRealocacao ? `${motivoRealocacao}. ` : ""}Nenhum closer livre às ${timeStr} de ${dateStr}. Ofereça outro horário (/silva-disponibilidade).`,
        }, 409);
      }
      requestedCloserId = alt.id;
      assignedCloserName = alt.name;
      fallbackSuggestedName = alt.name;
      if (b.slot_id) closerDoSlotRespeitado = false;
    }

    if (b.dry_run) {
      return json({
        dry_run: true,
        gravado: false,
        data: dateStr,
        hora: timeStr,
        inicio: toSpIso(start),
        status: "agendada",
        closer: assignedCloserName,
        closer_id: requestedCloserId,
        closer_do_slot_respeitado: closerDoSlotRespeitado,
        closer_realocado: Boolean(motivoRealocacao),
        motivo_realocacao: motivoRealocacao,
        fila_atribuicao: false,
        turma,
        vagas_restantes: Math.max(0, (turma === "A" ? TURMA_A_MAX_PER_HOUR : TURMA_B_MAX_PER_HOUR) - info.count),
      }, 200);
    }

    // 5) Meta Lead ID via DataCrazy (best effort)
    const metaLeadId = b.crm_lead_id ? await fetchMetaLeadId(b.crm_lead_id) : null;

    // 6) Observação
    const obsParts: string[] = [];
    if (motivoRealocacao) obsParts.push(`Closer realocado (${motivoRealocacao})`);
    obsParts.push(`Agendado pelo SDR IA (${b.sdr})`);
    if (b.funil) obsParts.push(`Funil: ${b.funil}`);
    if (typeof b.decisor_presente === "boolean") obsParts.push(`Decisor presente: ${b.decisor_presente ? "sim" : "não"}`);
    if (b.crm_conversation_id) obsParts.push(`Conversa CRM: ${b.crm_conversation_id}`);
    const overbookingNumber = sdrIaOverbookingPosition(info.count, info.capacity);
    if (overbookingNumber > 0) obsParts.push(`Overbooking: extra ${overbookingNumber}/3`);

    // 7) Com closer, cria Calendar/Meet pelo mesmo fluxo do painel.
    // Falha nunca é silenciosa: o motivo real do Google vai para agendamentos.meet_error,
    // para o audit log e para a resposta desta rota.
    let meetLink: string | null = null;
    let googleEventId: string | null = null;
    let meetErro: string | null = null;
    if (requestedCloserId) {
      try {
        const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-create-event`;
        const meetRes = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "x-api-key": expected,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            closer_id: requestedCloserId,
            lead_name: b.nome.trim(),
            lead_phone: phone,
            sdr_name: sdrProfile.full_name || SDR_IA_NAME,
            scheduled_date: dateStr,
            scheduled_time: timeStr,
            duration_minutes: 60,
          }),
        });
        const meetBody = await meetRes.json().catch(() => null);
        if (meetRes.ok && meetBody?.success) {
          meetLink = meetBody.meet_link ?? null;
          googleEventId = meetBody.event_id ?? null;
        }
        if (!meetLink) {
          const partes = [
            meetBody?.error ? `erro=${meetBody.error}` : `http=${meetRes.status}`,
            meetBody?.motivo ?? null,
            meetBody?.closer_email ? `closer=${meetBody.closer_email}` : null,
            meetBody?.details ? `google=${String(meetBody.details).slice(0, 800)}` : null,
          ].filter(Boolean);
          meetErro = partes.join(" | ");
          console.error("google-create-event sem link", meetRes.status, meetErro);
        }
      } catch (meetError) {
        meetErro = `erro=chamada_falhou | ${errorDetail(meetError)}`;
        console.error("google-create-event unexpected error", meetError);
      }
    }


    // 8) INSERT (mesmos campos da tela; triggers de CRM/CAPI/fila disparam sozinhos)
    const insert = {
      lead_name: b.nome.trim(),
      lead_phone: phone,
      lead_email: b.email ?? null,
      closer_id: requestedCloserId,
      scheduled_date: dateStr,
      scheduled_time: timeStr,
      status: requestedCloserId ? "agendada" : "pendente",
      observation: obsParts.join(" | "),
      briefing: b.briefing?.trim() || null,
      channel_type: b.canal,
      booking_channel: BOOKING_CHANNEL,
      meeting_reason: null,
      created_by: sdrProfile.user_id,
      sdr_responsavel_id: sdrProfile.user_id,
      duration_minutes: 60,
      is_5k: false,
      meta_lead_id: metaLeadId,
      crm_lead_id: b.crm_lead_id ?? null,
      idempotency_key: b.idempotency_key ?? null,
      meet_link: meetLink,
      google_event_id: googleEventId,
      meet_error: meetErro,
      lead_desqualificado: b.lead_desqualificado ?? false,
    };
    const { data: created, error } = await supabase.from("agendamentos").insert(insert).select("*").single();
    if (error) {
      const detalhe = errorDetail(error);
      if (/turma|desqualificad|treinamento/i.test(detalhe)) {
        return json({ erro: "turma_incompativel", detalhe }, 409);
      }
      if (error.code === "23505" && b.idempotency_key) {
        const { data: prev } = await supabase.from("agendamentos").select("*").eq("idempotency_key", b.idempotency_key).single();
        if (prev) return json({ ...(await toResponse(supabase, prev)), idempotente: true }, 200);
      }
      throw error;
    }

    // 9) Auditoria (trigger pula quando auth.uid() é null)
    await supabase.from("audit_logs").insert({
      user_id: sdrProfile.user_id,
      user_name: sdrProfile.full_name,
      user_email: SDR_IA_EMAIL,
      action: "create_agendamento",
      entity_type: "agendamento",
      entity_id: created.id,
      details: {
         lead_name: created.lead_name, closer_name: assignedCloserName ?? "", scheduled_date: dateStr, scheduled_time: timeStr,
        channel_type: b.canal, booking_channel: BOOKING_CHANNEL, lead_desqualificado: b.lead_desqualificado ?? false, origem: b.origem, via: "silva-agendar",
         closer_sugerido: fallbackSuggestedName, crm_lead_id: b.crm_lead_id ?? null,
        crm_conversation_id: b.crm_conversation_id ?? null,
         overbooking_extra: overbookingNumber || null,
      },
    });

    // 10) Tag "agendamento" no CRM (best effort) + vínculo da conversa
    let tag: string = "skipped";
    if (b.crm_lead_id) tag = await ensureLeadTag(b.crm_lead_id, "agendamento");
    if (b.crm_conversation_id) {
      await supabase.from("sdr_conversas").upsert({
        conversation_id: b.crm_conversation_id,
        lead_id: b.crm_lead_id ?? null,
        telefone: phone,
        origem: b.origem,
        etapa: "agendado",
        agendamento_id: created.id,
      }, { onConflict: "conversation_id" });
    }

    return json({
      ...(await toResponse(supabase, created)),
      closer_sugerido: fallbackSuggestedName,
      // false quando o closer do slot_id estava indisponível e outro closer livre assumiu.
      closer_do_slot_respeitado: closerDoSlotRespeitado,
      closer_realocado: Boolean(motivoRealocacao),
      motivo_realocacao: motivoRealocacao,
      crm_tag: tag,
    }, 201);
  } catch (e) {
    console.error("silva-agendar error", e);
    return json({ erro: "internal_error", detalhe: errorDetail(e) }, 500);
  }
});
