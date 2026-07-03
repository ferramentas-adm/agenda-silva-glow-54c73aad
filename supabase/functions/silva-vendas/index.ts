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

function isoToBRDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
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
  const since = url.searchParams.get("since");
  const vendeuParam = url.searchParams.get("vendeu");
  const limitParam = url.searchParams.get("limit");
  const vendeu = vendeuParam === null ? true : vendeuParam === "true";
  const limit = limitParam ? parseInt(limitParam, 10) : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let query = supabase
    .from("vendas")
    .select(`
      id, valor, valor_total_projeto, produto, resumo_venda,
      segunda_reuniao, follow_up, motivo_nao_fechamento, vendeu,
      agendamento_id, created_at,
      agendamentos!inner (
        scheduled_date, scheduled_time, lead_name, is_venda_avulsa, is_5k,
        closers ( name, email )
      )
    `)
    .eq("vendeu", vendeu)
    .order("created_at", { ascending: false });

  if (since) {
    query = query.gte("agendamentos.scheduled_date", since);
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

  const vendas = (data ?? []).map((v: any) => {
    const ag = v.agendamentos ?? {};
    const closer = ag.closers ?? {};
    const data_str = ag.scheduled_date
      ? toBRDate(ag.scheduled_date)
      : isoToBRDate(v.created_at);
    return {
      closer: closer.name ?? null,
      closer_email: closer.email ?? null,
      lead: ag.lead_name ?? null,
      data: data_str,
      hora_reuniao: ag.scheduled_time ?? null,
      valor: v.valor,
      valor_total_projeto: v.valor_total_projeto,
      is_venda_avulsa: ag.is_venda_avulsa ?? false,
      is_5k: ag.is_5k ?? false,
      produto: v.produto,
      resumo_venda: v.resumo_venda,
      segunda_reuniao: v.segunda_reuniao ?? false,
      follow_up: v.follow_up ?? false,
      motivo_nao_fechamento: v.motivo_nao_fechamento,
      agendamento_id: v.agendamento_id,
    };
  });

  const total_faturado = vendas.reduce(
    (sum, v) => sum + Number(v.valor_total_projeto ?? v.valor ?? 0),
    0,
  );

  return new Response(
    JSON.stringify({
      count: vendas.length,
      total_faturado,
      sincronizado_em: new Date().toISOString(),
      vendas,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
