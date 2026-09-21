import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};

function toBRDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function defaultSince(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = req.headers.get("x-api-key");
  const expected = Deno.env.get("SILVA_VENDAS_API_KEY");
  if (!expected || apiKey !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? defaultSince();
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : null;
  const statusParam = url.searchParams.get("status");
  const statusList = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  // Canceladas por rotina interna (atribuir closer, bloqueio de horário, teto por closer)
  // são ruído no relatório: ficam ocultas por padrão. Use mostrar_tudo=1 para ver todas.
  const mostrarTudo = ["1", "true", "sim"].includes((url.searchParams.get("mostrar_tudo") ?? "").toLowerCase());

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let query = supabase
    .from("agendamentos")
    .select(`
      id, lead_name, lead_phone, scheduled_date, scheduled_time, status,
      is_venda_avulsa, is_5k, meeting_reason, channel_type,
      lembrete_video_enviado, cancellation_reason, cancellation_note, observation,
      meet_link, google_event_id, meet_error,
      closers ( id, name, email )
    `)
    .gte("scheduled_date", since)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false })
    .order("scheduled_time", { ascending: false });

  if (statusList && statusList.length > 0) {
    query = query.in("status", statusList);
  }

  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const AUTO_CANCEL = /atribui|atribuir closer|bloqueio de hor|teto por closer|limite por closer|realocad|conserto (interno|de closer)/i;
  const isRuido = (a: any) =>
    a.status === "cancelada" && AUTO_CANCEL.test(String(a.cancellation_reason ?? ""));

  const visiveis = (data ?? []).filter((a: any) => mostrarTudo || !isRuido(a));
  const ocultadas = (data ?? []).length - visiveis.length;

  const reunioes = visiveis.map((a: any) => {
    const closer = a.closers ?? {};
    return {
      closer: closer.name ?? null,
      closer_email: closer.email ?? null,
      lead: a.lead_name ?? null,
      lead_whatsapp: a.lead_phone ?? null,
      data: a.scheduled_date ? toBRDate(a.scheduled_date) : null,
      hora_reuniao: a.scheduled_time ?? null,
      status: a.status ?? null,
      is_venda_avulsa: a.is_venda_avulsa ?? false,
      is_5k: a.is_5k ?? false,
      meeting_reason: a.meeting_reason ?? null,
      channel_type: a.channel_type ?? null,
      lembrete_video_enviado: a.lembrete_video_enviado ?? null,
      motivo_cancelamento: a.cancellation_reason ?? null,
      cancelamento_automatico: isRuido(a),
      agendamento_id: a.id,
    };
  });

  return new Response(
    JSON.stringify({
      count: reunioes.length,
      since_used: since,
      canceladas_automaticas_ocultadas: ocultadas,
      mostrar_tudo: mostrarTudo,
      sincronizado_em: new Date().toISOString(),
      reunioes,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
