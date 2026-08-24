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
  const until = url.searchParams.get("until");
  const vendeuParam = url.searchParams.get("vendeu");
  const origemParam = (url.searchParams.get("origem") ?? "").trim().toLowerCase();
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
      id, valor, valor_total_projeto, produto, resumo_venda, order_bumps,
      segunda_reuniao, follow_up, motivo_nao_fechamento, vendeu,
      venda_origem, closed_at,
      agendamento_id, created_at,
      agendamentos!inner (
        scheduled_date, scheduled_time, lead_name, lead_phone, is_venda_avulsa, is_5k,
        channel_type, meeting_reason, deleted_at,
        closers ( name, email )
      )
    `)
    .eq("vendeu", vendeu)
    .order("created_at", { ascending: false });

  // A data da VENDA é closed_at (fallback: created_at). Filtrar pela data da
  // reunião escondia as vendas de follow-up (reunião antiga, venda recente).
  if (since) {
    query = query.or(
      `closed_at.gte.${since},and(closed_at.is.null,created_at.gte.${since}T00:00:00Z)`,
    );
  }
  if (until) {
    query = query.or(
      `closed_at.lte.${until},and(closed_at.is.null,created_at.lte.${until}T23:59:59Z)`,
    );
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

  const vendas = (data ?? [])
    .filter((v: any) => !v.agendamentos?.deleted_at)
    .map((v: any) => {
      const ag = v.agendamentos ?? {};
      const closer = ag.closers ?? {};
      const order_bumps = Array.isArray(v.order_bumps)
        ? v.order_bumps
            .map((b: any) => ({ nome: b?.nome ?? null, valor: Number(b?.valor) || 0 }))
            .filter((b: any) => !!b.nome)
        : [];
      const data_venda = v.closed_at ?? (v.created_at ? v.created_at.slice(0, 10) : null);
      const origem = v.venda_origem
        ? v.venda_origem
        : v.segunda_reuniao || (v.closed_at && ag.scheduled_date && v.closed_at > ag.scheduled_date)
          ? "follow_up"
          : "primeira_call";
      return {
        closer: closer.name ?? null,
        closer_email: closer.email ?? null,
        lead: ag.lead_name ?? null,
        lead_whatsapp: ag.lead_phone ?? null,
        // "data" = data da venda (compatibilidade)
        data: data_venda ? toBRDate(data_venda) : isoToBRDate(v.created_at),
        data_venda_iso: data_venda,
        data_reuniao: ag.scheduled_date ? toBRDate(ag.scheduled_date) : null,
        data_reuniao_iso: ag.scheduled_date ?? null,
        hora_reuniao: ag.scheduled_time ?? null,
        valor: v.valor,
        valor_total_projeto: v.valor_total_projeto,
        is_venda_avulsa: ag.is_venda_avulsa ?? false,
        is_5k: ag.is_5k ?? false,
        channel_type: ag.channel_type ?? null,
        meeting_reason: ag.meeting_reason ?? null,
        produto: v.produto,
        order_bumps: order_bumps,
        order_bumps_total: order_bumps.reduce(
          (sum: number, b: any) => sum + (Number(b?.valor) || 0),
          0,
        ),
        resumo_venda: v.resumo_venda,
        venda_origem: origem,
        origem_label: origem === "follow_up" ? "Venda de follow-up" : "Venda de 1ª call",
        segunda_reuniao: v.segunda_reuniao ?? false,
        follow_up: v.follow_up ?? false,
        motivo_nao_fechamento: v.motivo_nao_fechamento,
        agendamento_id: v.agendamento_id,
        venda_id: v.id,
      };
    })
    .filter((v: any) => !origemParam || v.venda_origem === origemParam);


  const total_faturado = vendas.reduce(
    (sum, v) => sum + Number(v.valor_total_projeto ?? v.valor ?? 0),
    0,
  );

  return new Response(
    JSON.stringify({
      count: vendas.length,
      count_primeira_call: vendas.filter((v: any) => v.venda_origem === "primeira_call").length,
      count_follow_up: vendas.filter((v: any) => v.venda_origem === "follow_up").length,
      total_faturado,
      sincronizado_em: new Date().toISOString(),
      vendas,
    }),

    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
