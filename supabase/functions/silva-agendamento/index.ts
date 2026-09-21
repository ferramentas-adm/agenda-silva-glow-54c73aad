// GET /silva-agendamento/{id}  (ou /silva-agendamento?id=...)
// Leitura de um agendamento já criado, incluindo o link do Meet e o erro real
// do Google quando o link não existe. Mesma chave das outras rotas silva-*.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ erro: "method_not_allowed" }, 405);

  const apiKey = req.headers.get("x-api-key");
  const expected = Deno.env.get("SDR_IA_API_KEY");
  const expectedLeitura = Deno.env.get("SILVA_VENDAS_API_KEY");
  if (!apiKey || (apiKey !== expected && apiKey !== expectedLeitura)) {
    return json({ erro: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const fromPath = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const id = url.searchParams.get("id") || (fromPath !== "silva-agendamento" ? fromPath : "");
  if (!UUID.test(id)) return json({ erro: "id_invalido", detalhe: "informe o agendamento_id (uuid)" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("agendamentos")
    .select(`
      id, lead_name, lead_phone, lead_email, scheduled_date, scheduled_time, duration_minutes,
      status, briefing, observation, channel_type, booking_channel, meeting_reason,
      cancellation_reason, cancellation_note, crm_lead_id, meta_lead_id, idempotency_key,
      meet_link, google_event_id, meet_error, lead_desqualificado, deleted_at, created_at,
      closers ( id, name, email )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) return json({ erro: "internal_error", detalhe: error.message }, 500);
  if (!data) return json({ erro: "nao_encontrado" }, 404);

  const closer = (data as Record<string, any>).closers ?? null;
  return json({
    agendamento_id: data.id,
    lead: { nome: data.lead_name, whatsapp: data.lead_phone, email: data.lead_email },
    data: data.scheduled_date,
    hora: String(data.scheduled_time ?? "").slice(0, 5),
    duracao_minutos: data.duration_minutes,
    status: data.status,
    closer: closer?.name ?? null,
    closer_email: closer?.email ?? null,
    closer_id: closer?.id ?? null,
    link_reuniao: data.meet_link ?? null,
    link_erro: data.meet_link ? null : (data.meet_error ?? null),
    google_event_id: data.google_event_id ?? null,
    briefing: data.briefing ?? null,
    observacao: data.observation ?? null,
    canal: data.channel_type ?? null,
    canal_agendamento: data.booking_channel ?? null,
    motivo_cancelamento: data.cancellation_reason ?? null,
    justificativa_cancelamento: data.cancellation_note ?? null,
    lead_desqualificado: data.lead_desqualificado ?? false,
    crm_lead_id: data.crm_lead_id ?? null,
    meta_lead_id: data.meta_lead_id ?? null,
    excluido: Boolean(data.deleted_at),
    criado_em: data.created_at,
  });
});
