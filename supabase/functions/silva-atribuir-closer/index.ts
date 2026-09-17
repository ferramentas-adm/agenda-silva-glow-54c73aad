// POST /silva-atribuir-closer — atribui closer MANTENDO o mesmo agendamento.
// Não cancela, não cria linha nova: só grava closer_id (+ Meet, se ainda não houver).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { loadDayAvailability, spDateTime, suggestCloser, suggestFreeCloser, toSpIso } from "../_shared/disponibilidade.ts";
import { errorDetail } from "../_shared/erro.ts";

const SDR_IA_EMAIL = "joao.amorim.ia@ogruposilva.com.br";
const SDR_IA_NAME = "João Amorim";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  agendamento_id: z.string().uuid(),
  closer_id: z.string().uuid().optional(),
  atribuido_por: z.string().trim().min(1).max(200).optional(),
  /** Permite trocar o closer de uma reunião que já tem um. Default: false. */
  forcar: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: sdrProfile } = await supabase.from("profiles").select("user_id, full_name")
      .eq("email", SDR_IA_EMAIL).maybeSingle();
    if (!sdrProfile) return json({ erro: "sdr_ia_nao_configurado", detalhe: "execute /sdr-ia-setup" }, 500);

    const { data: ag, error: loadError } = await supabase.from("agendamentos").select("*")
      .eq("id", b.agendamento_id).is("deleted_at", null).maybeSingle();
    if (loadError) throw loadError;
    if (!ag) return json({ erro: "nao_encontrado" }, 404);
    if (["cancelada", "realizada", "no_show", "reagendada"].includes(ag.status)) {
      return json({ erro: "status_invalido", detalhe: `reunião está ${ag.status}` }, 409);
    }

    const dateStr = String(ag.scheduled_date);
    const timeStr = String(ag.scheduled_time).slice(0, 5);

    // Idempotente: já está com o closer pedido.
    if (ag.closer_id && (!b.closer_id || ag.closer_id === b.closer_id)) {
      const { data: current } = await supabase.from("closers").select("name").eq("id", ag.closer_id).maybeSingle();
      return json({
        ok: true,
        agendamento_id: ag.id,
        inicio: toSpIso(spDateTime(dateStr, timeStr)),
        status: ag.status,
        closer: current?.name ?? null,
        closer_id: ag.closer_id,
        link_reuniao: ag.meet_link ?? null,
        ja_atribuido: true,
      });
    }
    if (ag.closer_id && b.closer_id && b.closer_id !== ag.closer_id && !b.forcar) {
      const { data: current } = await supabase.from("closers").select("name").eq("id", ag.closer_id).maybeSingle();
      return json({ erro: "ja_tem_closer", closer_atual: current?.name ?? null, closer_id_atual: ag.closer_id }, 409);
    }

    // Escolhe o closer respeitando turma, bloqueios e elegibilidade do horário.
    const turma: "A" | "B" = ag.lead_desqualificado ? "B" : "A";
    const availability = await loadDayAvailability(supabase, dateStr, undefined, turma);
    const info = availability.hours.get(timeStr);
    if (!info || info.eligibleClosers.length === 0) return json({ erro: "sem_closer_disponivel" }, 409);
    // TRAVA DE SEGURANÇA: compromisso/bloqueio nunca é removido para caber reunião.
    if (b.closer_id && info.blockedCloserIds.has(b.closer_id)) {
      return json({
        erro: "slot_bloqueado",
        detalhe: `esse closer tem compromisso/bloqueio às ${timeStr} de ${dateStr}`,
      }, 409);
    }
    const chosen = b.closer_id
      ? info.eligibleClosers.find((c) => c.id === b.closer_id) ?? null
      : suggestFreeCloser(availability, timeStr) ?? suggestCloser(availability, timeStr);
    if (!chosen) {
      return json({
        erro: b.closer_id ? "closer_indisponivel" : "sem_closer_disponivel",
        detalhe: b.closer_id
          ? "closer inativo, bloqueado nesse horário ou de outra turma"
          : `nenhum closer elegível às ${timeStr}`,
      }, 409);
    }

    // Cria Meet só se a reunião ainda não tem link (nunca substitui o link existente).
    let meetLink: string | null = ag.meet_link ?? null;
    let googleEventId: string | null = ag.google_event_id ?? null;
    // Reunião já passada só recebe o closer (conserto de histórico), sem criar evento no Google.
    const jaPassou = spDateTime(dateStr, timeStr).getTime() <= Date.now();
    if (!meetLink && !jaPassou) {
      try {
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-create-event`, {
          method: "POST",
          headers: { "x-api-key": expected, "Content-Type": "application/json" },
          body: JSON.stringify({
            closer_id: chosen.id,
            lead_name: ag.lead_name,
            lead_phone: ag.lead_phone,
            sdr_name: sdrProfile.full_name || SDR_IA_NAME,
            scheduled_date: dateStr,
            scheduled_time: timeStr,
            duration_minutes: ag.duration_minutes ?? 60,
          }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.success) {
          meetLink = body.meet_link ?? null;
          googleEventId = body.event_id ?? null;
        } else console.error("google-create-event failed", res.status, body);
      } catch (meetError) {
        console.error("google-create-event unexpected error", meetError);
      }
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      closer_id: chosen.id,
      meet_link: meetLink,
      google_event_id: googleEventId,
      sdr_handoff_at: ag.sdr_handoff_at ?? nowIso,
      closer_handoff_at: nowIso,
      closer_returned_at: null,
      closer_return_reason: null,
    };
    if (ag.status === "pendente") update.status = "agendada";

    const { data: updated, error: updateError } = await supabase.from("agendamentos")
      .update(update).eq("id", ag.id).is("deleted_at", null).select("*").single();
    if (updateError) {
      const detalhe = errorDetail(updateError);
      if (/turma|desqualificad|treinamento/i.test(detalhe)) return json({ erro: "turma_incompativel", detalhe }, 409);
      throw updateError;
    }

    await supabase.from("audit_logs").insert({
      user_id: sdrProfile.user_id,
      user_name: sdrProfile.full_name || SDR_IA_NAME,
      user_email: SDR_IA_EMAIL,
      action: "assign_closer",
      entity_type: "agendamento",
      entity_id: updated.id,
      details: {
        lead_name: updated.lead_name,
        closer_name: chosen.name,
        closer_anterior_id: ag.closer_id ?? null,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        atribuido_por: b.atribuido_por ?? "João Amorim (IA)",
        via: "silva-atribuir-closer",
      },
    });

    return json({
      ok: true,
      agendamento_id: updated.id,
      inicio: toSpIso(spDateTime(dateStr, timeStr)),
      status: updated.status,
      closer: chosen.name,
      closer_id: chosen.id,
      link_reuniao: updated.meet_link ?? null,
      ja_atribuido: false,
    });
  } catch (error) {
    console.error("silva-atribuir-closer error", error);
    return json({ erro: "internal_error", detalhe: errorDetail(error) }, 500);
  }
});
