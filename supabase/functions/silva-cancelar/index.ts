// POST /silva-cancelar — cancela um agendamento criado pelo SDR IA.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { spDateTime, toSpIso } from "../_shared/disponibilidade.ts";
import { errorDetail } from "../_shared/erro.ts";
import { loadOfficialReasons, matchOfficialReason } from "../_shared/motivos.ts";

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
  // Motivo precisa ser um item da lista oficial (Admin > Motivos de não comparecimento).
  motivo: z.string().trim().min(1).max(500),
  // Justificativa livre obrigatória, para enriquecimento de dados.
  justificativa: z.string().trim().min(1).max(1000),
  cancelado_por: z.literal("João Amorim (IA)"),
});

type Client = ReturnType<typeof createClient>;

async function loadSdrProfile(supabase: Client) {
  const { data } = await supabase.from("profiles").select("user_id, full_name")
    .eq("email", SDR_IA_EMAIL).maybeSingle();
  return data;
}

async function responseFor(supabase: Client, appointment: Record<string, unknown>) {
  let closer: string | null = null;
  if (typeof appointment.closer_id === "string" && appointment.closer_id) {
    const { data } = await supabase.from("closers").select("name")
      .eq("id", appointment.closer_id).maybeSingle();
    closer = data?.name ?? null;
  }
  const date = String(appointment.scheduled_date);
  const time = String(appointment.scheduled_time).slice(0, 5);
  return {
    ok: true,
    agendamento_id: appointment.id,
    status: "cancelada",
    inicio: toSpIso(spDateTime(date, time)),
    closer,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const sdrProfile = await loadSdrProfile(supabase);
    if (!sdrProfile) return json({ erro: "sdr_ia_nao_configurado", detalhe: "execute /sdr-ia-setup" }, 500);

    const officialReasons = await loadOfficialReasons(supabase);
    const motivoOficial = matchOfficialReason(parsed.data.motivo, officialReasons);
    if (!motivoOficial) {
      return json({
        erro: "motivo_invalido",
        detalhe: "Use exatamente um dos motivos da lista e detalhe o resto em justificativa.",
        motivos_validos: officialReasons,
      }, 400);
    }

    // Aceita reuniões de qualquer origem (SDR IA ou criadas pela tela).
    const { data: appointment, error: loadError } = await supabase.from("agendamentos").select("*")
      .eq("id", parsed.data.agendamento_id).is("deleted_at", null).maybeSingle();
    if (loadError) throw loadError;
    if (!appointment) return json({ erro: "nao_encontrado" }, 404);

    if (appointment.status === "cancelada") return json(await responseFor(supabase, appointment));
    const startsAt = spDateTime(appointment.scheduled_date, String(appointment.scheduled_time).slice(0, 5));
    if (appointment.status === "realizada" || startsAt.getTime() <= Date.now()) {
      return json({ erro: "ja_realizada" }, 409);
    }

    const { data: cancelled, error: updateError } = await supabase.from("agendamentos").update({
      status: "cancelada",
      cancellation_reason: motivoOficial,
      cancellation_note: parsed.data.justificativa,
    }).eq("id", appointment.id).neq("status", "realizada").select("*").maybeSingle();
    if (updateError) throw updateError;
    if (!cancelled) {
      const { data: current } = await supabase.from("agendamentos").select("*").eq("id", appointment.id).maybeSingle();
      if (current?.status === "cancelada") return json(await responseFor(supabase, current));
      return json({ erro: "ja_realizada" }, 409);
    }

    await supabase.from("audit_logs").insert({
      user_id: sdrProfile.user_id,
      user_name: sdrProfile.full_name || SDR_IA_NAME,
      user_email: SDR_IA_EMAIL,
      action: "cancel_agendamento",
      entity_type: "agendamento",
      entity_id: cancelled.id,
      details: {
        motivo: motivoOficial,
        justificativa: parsed.data.justificativa,
        cancelado_por: parsed.data.cancelado_por,
        scheduled_date: cancelled.scheduled_date,
        scheduled_time: cancelled.scheduled_time,
        via: "silva-cancelar",
      },
    });

    return json(await responseFor(supabase, cancelled));
  } catch (error) {
    console.error("silva-cancelar error", error);
    return json({ erro: "internal_error", detalhe: errorDetail(error) }, 500);
  }
});