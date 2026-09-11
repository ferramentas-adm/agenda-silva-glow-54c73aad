// POST /silva-agendar — cria agendamento pelo SDR IA (João Amorim).
// PILOTO: SEMPRE cria sem closer (closer_id = null) na fila "Aguardando atribuição".
// O slot_id só serve para revalidar a disponibilidade e sugerir o closer na observação.
// O Meet nasce na atribuição pelo gestor (google-create-event), como já ocorre hoje.
// TODO (fase 2): closer direto + criação do Meet no próprio POST.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { MIN_LEAD_MINUTES, loadDayAvailability, spParts, toSpIso } from "../_shared/disponibilidade.ts";
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
  funil: z.enum(["formulario", "vsl-direta"]).optional(),
  decisor_presente: z.boolean().optional(),
  briefing: z.string().max(5000).optional(),
  crm_lead_id: z.string().max(100).optional(),
  crm_conversation_id: z.string().max(100).optional(),
  idempotency_key: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
});

const normalizePhone = (p: string) => {
  let d = p.replace(/\D/g, "");
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  return d;
};

function toResponse(a: Record<string, unknown>) {
  const inicio = toSpIso(new Date(`${a.scheduled_date}T${String(a.scheduled_time).slice(0, 5)}:00-03:00`));
  return {
    agendamento_id: a.id,
    data: a.scheduled_date,
    hora: String(a.scheduled_time).slice(0, 5),
    inicio,
    status: a.status,
    closer: null,
    link_reuniao: null,
    fila_atribuicao: true,
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
      if (prev) return json({ ...toResponse(prev), idempotente: true }, 200);
    }

    // 1) Resolver início / closer sugerido
    let isoStart = b.inicio ?? "";
    let suggestedCloserId: string | null = null;
    if (b.slot_id) {
      const [iso, closerId] = b.slot_id.split("|");
      isoStart = iso;
      suggestedCloserId = closerId || null;
    }
    const start = new Date(isoStart);
    if (Number.isNaN(start.getTime())) return json({ erro: "inicio_invalido" }, 400);
    const now = new Date();
    if (start.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) {
      return json({ erro: "horario_muito_proximo", minimo_minutos: MIN_LEAD_MINUTES }, 409);
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

    // 4) Revalidar slot (mesma regra da tela: lotação global da hora)
    const avail = await loadDayAvailability(supabase, dateStr);
    if (!avail.slots.includes(timeStr)) return json({ erro: "horario_fora_da_grade" }, 409);
    const info = avail.hours.get(timeStr);
    if (!info || info.full || info.freeClosers.length === 0) {
      return json({ erro: "slot_indisponivel", detalhe: "horário lotado; consulte /silva-disponibilidade" }, 409);
    }
    let suggestedName: string | null = null;
    if (suggestedCloserId) {
      suggestedName = info.freeClosers.find((c) => c.id === suggestedCloserId)?.name ?? null;
    }
    if (!suggestedName) {
      const alt = [...info.freeClosers].sort((a, c) =>
        (avail.perCloserDay.get(a.id) ?? 0) - (avail.perCloserDay.get(c.id) ?? 0))[0];
      suggestedName = alt?.name ?? null;
    }

    // 5) Meta Lead ID via DataCrazy (best effort)
    const metaLeadId = b.crm_lead_id ? await fetchMetaLeadId(b.crm_lead_id) : null;

    // 6) Observação
    const obsParts: string[] = [];
    if (suggestedName) obsParts.push(`Closer sugerido: ${suggestedName}`);
    obsParts.push(`Agendado pelo SDR IA (${b.sdr})`);
    if (b.funil) obsParts.push(`Funil: ${b.funil}`);
    if (typeof b.decisor_presente === "boolean") obsParts.push(`Decisor presente: ${b.decisor_presente ? "sim" : "não"}`);
    if (b.crm_conversation_id) obsParts.push(`Conversa CRM: ${b.crm_conversation_id}`);

    // 7) INSERT (mesmos defaults da tela; triggers de CRM/CAPI/fila disparam sozinhos)
    const insert = {
      lead_name: b.nome.trim(),
      lead_phone: phone,
      lead_email: b.email ?? null,
      closer_id: null,
      scheduled_date: dateStr,
      scheduled_time: timeStr,
      status: "pendente",
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
      meet_link: null,
      google_event_id: null,
    };
    const { data: created, error } = await supabase.from("agendamentos").insert(insert).select("*").single();
    if (error) {
      if (error.code === "23505" && b.idempotency_key) {
        const { data: prev } = await supabase.from("agendamentos").select("*").eq("idempotency_key", b.idempotency_key).single();
        if (prev) return json({ ...toResponse(prev), idempotente: true }, 200);
      }
      throw error;
    }

    // 8) Auditoria (trigger pula quando auth.uid() é null)
    await supabase.from("audit_logs").insert({
      user_id: sdrProfile.user_id,
      user_name: sdrProfile.full_name,
      user_email: SDR_IA_EMAIL,
      action: "create_agendamento",
      entity_type: "agendamento",
      entity_id: created.id,
      details: {
        lead_name: created.lead_name, closer_name: "", scheduled_date: dateStr, scheduled_time: timeStr,
        channel_type: b.canal, booking_channel: BOOKING_CHANNEL, origem: b.origem, via: "silva-agendar",
        closer_sugerido: suggestedName, crm_lead_id: b.crm_lead_id ?? null,
        crm_conversation_id: b.crm_conversation_id ?? null,
      },
    });

    // 9) Tag "agendamento" no CRM (best effort) + vínculo da conversa
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

    return json({ ...toResponse(created), closer_sugerido: suggestedName, crm_tag: tag }, 201);
  } catch (e) {
    console.error("silva-agendar error", e);
    return json({ erro: "internal_error", detalhe: e instanceof Error ? e.message : String(e) }, 500);
  }
});
