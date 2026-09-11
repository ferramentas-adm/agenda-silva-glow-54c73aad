import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IDS = [
  "b8a59f83-a0ea-4e6b-9d01-afe67a1a08cc",
  "2bd64e3e-f463-41b5-a9d8-8090e83ae946",
];
const WEBHOOK_URL = "https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6";

serve(async () => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internal = Deno.env.get("SDR_IA_API_KEY") ?? "";
  const db = createClient(url, service);
  const results = [];

  for (const id of IDS) {
    const { data: ag, error } = await db.from("agendamentos").select("*").eq("id", id).single();
    if (error || !ag) { results.push({ id, error: "not_found" }); continue; }
    const { data: closer } = await db.from("closers").select("name").eq("id", ag.closer_id).single();
    const meetRes = await fetch(`${url}/functions/v1/google-create-event`, {
      method: "POST",
      headers: { Authorization: `Bearer ${anon}`, apikey: anon, "x-api-key": internal, "Content-Type": "application/json" },
      body: JSON.stringify({ closer_id: ag.closer_id, lead_name: ag.lead_name, lead_phone: ag.lead_phone, sdr_name: "João Amorim", scheduled_date: ag.scheduled_date, scheduled_time: ag.scheduled_time, duration_minutes: ag.duration_minutes }),
    });
    const meet = await meetRes.json().catch(() => null);
    if (!meetRes.ok || !meet?.success) { results.push({ id, meet_status: meetRes.status, error: meet?.error ?? "meet_failed" }); continue; }
    const { error: updateError } = await db.from("agendamentos").update({ meet_link: meet.meet_link ?? null, google_event_id: meet.event_id ?? null }).eq("id", id);
    if (updateError) { results.push({ id, error: "update_failed" }); continue; }
    const start = String(ag.scheduled_date).replaceAll("-", "") + "T" + String(ag.scheduled_time).replaceAll(":", "") + "00";
    const [hour, minute] = String(ag.scheduled_time).split(":");
    const end = String(ag.scheduled_date).replaceAll("-", "") + "T" + String(Number(hour) + 1).padStart(2, "0") + minute + "00";
    const payload = {
      lead_name: ag.lead_name, lead_phone: ag.lead_phone, status: "Agendado",
      scheduled_datetime: `${ag.scheduled_date}T${ag.scheduled_time}:00Z`,
      created_at: new Date(ag.created_at).toISOString().replace(/\.\d{3}Z$/, "Z"),
      sdr_name: "João Amorim", closer_name: closer?.name ?? "", briefing: ag.briefing ?? "",
      meeting_reason: ag.meeting_reason ?? "", is_segunda_reuniao: ag.meeting_reason === "segunda_reuniao",
      is_vendido: null, is_follow_up: null, is_perdido: null, channel_type: ag.channel_type ?? "",
      meet_link: meet.meet_link ?? null,
      calendar_link: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Grupo Silva & ${ag.lead_name}`)}&dates=${start}/${end}&ctz=America/Sao_Paulo`,
      deleted_at: null, deletion_reason: null, cancellation_reason: null, nao_comparecimento_bucket: null,
      lead_revenue: null, vendeu: null, valor_coletado: null, resumo_venda: null,
      motivo_nao_fechamento: null, explicacao_nao_fechamento: null, valor_apresentado: null,
      follow_up_date: null, follow_up_time: null, observacoes: null, recebimento_acordado: false,
      valor_previsto: null, data_prevista: null,
    };
    const webhookRes = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    results.push({ id, meet_link: meet.meet_link ?? null, event_id: meet.event_id ?? null, webhook_status: webhookRes.status, webhook_ok: webhookRes.ok });
  }
  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
});
