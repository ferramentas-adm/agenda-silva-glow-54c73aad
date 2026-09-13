// POST /silva-reagendar — substitui uma reunião do SDR IA por outra em um slot válido.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  BOOKING_MIN_LEAD_MINUTES, loadDayAvailability, sdrIaOverbookingPosition,
  spDateTime, spParts, suggestCloser, toSpIso,
} from "../_shared/disponibilidade.ts";
import { ensureLeadTag } from "../_shared/datacrazyLead.ts";

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
  slot_id: z.string().min(1),
  motivo: z.string().trim().min(1).max(500),
  reagendado_por: z.literal("João Amorim (IA)"),
});

type Client = ReturnType<typeof createClient>;

async function createMeet(
  expectedKey: string,
  closerId: string,
  appointment: Record<string, unknown>,
  dateStr: string,
  timeStr: string,
) {
  try {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-create-event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-api-key": expectedKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        closer_id: closerId,
        lead_name: appointment.lead_name,
        lead_phone: appointment.lead_phone,
        sdr_name: SDR_IA_NAME,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        duration_minutes: appointment.duration_minutes ?? 60,
      }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.success) {
      return { meetLink: body.meet_link ?? null, googleEventId: body.event_id ?? null };
    }
    console.error("google-create-event failed", response.status, body);
  } catch (error) {
    console.error("google-create-event unexpected error", error);
  }
  return { meetLink: null, googleEventId: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  const slotParts = b.slot_id.split("|");
  if (slotParts.length !== 2 || !slotParts[0] || !z.string().uuid().safeParse(slotParts[1]).success) {
    return json({ erro: "payload_invalido", campos: { slot_id: ["Formato inválido"] } }, 400);
  }
  const start = new Date(slotParts[0]);
  if (Number.isNaN(start.getTime())) return json({ erro: "payload_invalido", campos: { slot_id: ["Início inválido"] } }, 400);
  if (start.getTime() < Date.now() + BOOKING_MIN_LEAD_MINUTES * 60_000) return json({ erro: "slot_indisponivel" }, 409);
  const startParts = spParts(start);
  if (startParts.minute !== 0) return json({ erro: "slot_indisponivel" }, 409);
  const dateStr = startParts.dateStr;
  const timeStr = `${String(startParts.hour).padStart(2, "0")}:00`;
  const requestedCloserId = slotParts[1];

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: sdrProfile } = await supabase.from("profiles").select("user_id, full_name")
      .eq("email", SDR_IA_EMAIL).maybeSingle();
    if (!sdrProfile) return json({ erro: "sdr_ia_nao_configurado", detalhe: "execute /sdr-ia-setup" }, 500);

    const { data: old, error: oldError } = await supabase.from("agendamentos").select("*")
      .eq("id", b.agendamento_id).is("deleted_at", null).maybeSingle();
    if (oldError) throw oldError;
    if (!old || (old.created_by !== sdrProfile.user_id && old.booking_channel !== "sdr-ia")) {
      return json({ erro: "nao_encontrado" }, 404);
    }
    if (["realizada", "cancelada", "no_show", "reagendada"].includes(old.status)) {
      return json({ erro: "ja_realizada" }, 409);
    }
    if (spDateTime(old.scheduled_date, String(old.scheduled_time).slice(0, 5)).getTime() <= Date.now()) {
      return json({ erro: "ja_realizada" }, 409);
    }

    // Valida a vaga antes de alterar a reunião antiga.
    const availability = await loadDayAvailability(supabase, dateStr);
    if (!availability.slots.includes(timeStr)) return json({ erro: "slot_indisponivel" }, 409);
    const info = availability.hours.get(timeStr);
    if (!info || info.full || info.eligibleClosers.length === 0) return json({ erro: "slot_indisponivel" }, 409);
    const requestedCloser = info.eligibleClosers.find((closer) => closer.id === requestedCloserId);
    if (!requestedCloser) return json({ erro: "slot_indisponivel" }, 409);

    // Mantém o closer anterior quando ele continua elegível; caso contrário usa o closer do slot.
    const previousCloser = typeof old.closer_id === "string"
      ? info.eligibleClosers.find((closer) => closer.id === old.closer_id)
      : null;
    const assignedCloser = previousCloser ?? requestedCloser ?? suggestCloser(availability, timeStr);
    if (!assignedCloser) return json({ erro: "slot_indisponivel" }, 409);

    const { meetLink, googleEventId } = await createMeet(expected, assignedCloser.id, old, dateStr, timeStr);
    const noteParts = [old.observation].filter(Boolean);
    noteParts.push(`Reagendado pelo SDR IA (${b.reagendado_por})`);
    noteParts.push(`Motivo do reagendamento: ${b.motivo}`);
    const overbookingNumber = sdrIaOverbookingPosition(info.count, info.capacity);
    if (overbookingNumber > 0) noteParts.push(`Overbooking: extra ${overbookingNumber}/3`);

    const insert = {
      lead_name: old.lead_name,
      lead_phone: old.lead_phone,
      lead_email: old.lead_email,
      lead_state: old.lead_state,
      closer_id: assignedCloser.id,
      scheduled_date: dateStr,
      scheduled_time: timeStr,
      status: "agendada",
      observation: noteParts.join(" | "),
      briefing: old.briefing,
      channel_type: old.channel_type,
      booking_channel: old.booking_channel || "sdr-ia",
      meeting_reason: old.meeting_reason,
      created_by: old.created_by || sdrProfile.user_id,
      sdr_responsavel_id: old.sdr_responsavel_id || sdrProfile.user_id,
      original_agendamento_id: old.id,
      duration_minutes: old.duration_minutes ?? 60,
      is_5k: old.is_5k ?? false,
      is_venda_avulsa: old.is_venda_avulsa ?? false,
      meta_lead_id: old.meta_lead_id,
      crm_lead_id: old.crm_lead_id,
      fbp: old.fbp,
      fbc: old.fbc,
      client_ip_address: old.client_ip_address,
      client_user_agent: old.client_user_agent,
      meet_link: meetLink,
      google_event_id: googleEventId,
    };
    const { data: created, error: createError } = await supabase.from("agendamentos").insert(insert).select("*").single();
    if (createError) throw createError;

    const { data: closedOld, error: closeError } = await supabase.from("agendamentos").update({
      status: "cancelada",
      cancellation_reason: b.motivo,
    }).eq("id", old.id).eq("status", old.status).select("id").maybeSingle();
    if (closeError || !closedOld) {
      await supabase.from("agendamentos").update({
        deleted_at: new Date().toISOString(),
        deleted_by: sdrProfile.user_id,
        deletion_reason: "Rollback: reunião original mudou durante o reagendamento",
      }).eq("id", created.id);
      if (closeError) throw closeError;
      return json({ erro: "conflito_agendamento" }, 409);
    }

    await supabase.from("audit_logs").insert({
      user_id: sdrProfile.user_id,
      user_name: sdrProfile.full_name || SDR_IA_NAME,
      user_email: SDR_IA_EMAIL,
      action: "reschedule_agendamento",
      entity_type: "agendamento",
      entity_id: created.id,
      details: {
        antigo_id: old.id,
        motivo: b.motivo,
        reagendado_por: b.reagendado_por,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        closer_name: assignedCloser.name,
        via: "silva-reagendar",
      },
    });

    if (old.crm_lead_id) await ensureLeadTag(old.crm_lead_id, "agendamento");
    if (old.crm_lead_id) {
      await supabase.from("sdr_conversas").update({ etapa: "agendado", agendamento_id: created.id })
        .eq("lead_id", old.crm_lead_id);
    }

    return json({
      ok: true,
      agendamento_id: created.id,
      antigo_id: old.id,
      inicio: toSpIso(spDateTime(dateStr, timeStr)),
      closer: assignedCloser.name,
      link_reuniao: created.meet_link ?? null,
    });
  } catch (error) {
    console.error("silva-reagendar error", error);
    return json({ erro: "internal_error", detalhe: error instanceof Error ? error.message : String(error) }, 500);
  }
});