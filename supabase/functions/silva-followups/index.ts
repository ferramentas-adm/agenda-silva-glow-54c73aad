import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function toBRDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// Hoje em America/Sao_Paulo (YYYY-MM-DD)
function brToday(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("SILVA_FOLLOWUPS_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const bloco = (url.searchParams.get("bloco") ?? "todos").toLowerCase();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const closerFilter = (url.searchParams.get("closer") ?? "").trim().toLowerCase();
  const motivoFilter = (url.searchParams.get("motivo") ?? "").trim().toLowerCase();
  const onlyAtrasados = url.searchParams.get("atrasados") === "true";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(1000, Math.max(1, parseInt(limitParam, 10))) : 500;


  const wantAcomp = bloco === "todos" || bloco === "em_acompanhamento";
  const wantNao = bloco === "todos" || bloco === "nao_acompanhados";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = brToday();

  const SELECT = `
    id, agendamento_id, follow_up, follow_up_date, follow_up_time,
    motivo_nao_fechamento, explicacao_nao_fechamento, observacoes, valor,
    created_at,
    agendamentos!inner (
      lead_name, lead_phone, scheduled_date, scheduled_time,
      channel_type, meeting_reason, deleted_at,
      closers ( name, email )
    )
  `;

  const mapRow = (v: any) => {
    const ag = v.agendamentos ?? {};
    const closer = ag.closers ?? {};
    const fud: string | null = v.follow_up_date ?? null;
    return {
      venda_id: v.id,
      agendamento_id: v.agendamento_id,
      closer: closer.name ?? null,
      closer_email: closer.email ?? null,
      lead: ag.lead_name ?? null,
      lead_whatsapp: ag.lead_phone ?? null,
      data_reuniao: toBRDate(ag.scheduled_date ?? null),
      data_reuniao_iso: ag.scheduled_date ?? null,
      hora_reuniao: ag.scheduled_time ?? null,
      data_follow_up: toBRDate(fud),
      data_follow_up_iso: fud,
      hora_follow_up: v.follow_up_time ?? null,
      atrasado: v.follow_up === true && !!fud && fud < today,
      hoje: v.follow_up === true && fud === today,
      motivo_nao_fechamento: v.motivo_nao_fechamento ?? null,
      explicacao_nao_fechamento: v.explicacao_nao_fechamento ?? null,
      observacoes: v.observacoes ?? null,
      valor_previsto: v.valor === null || v.valor === undefined ? null : Number(v.valor),
      channel_type: ag.channel_type ?? null,
      meeting_reason: ag.meeting_reason ?? null,
      registrado_em: v.created_at ?? null,
    };
  };

  const applyFilters = (rows: any[]) =>
    rows
      .filter((r) => !r.agendamentos?.deleted_at)
      .map(mapRow)
      .filter((r) => {
        if (closerFilter && !(r.closer ?? "").toLowerCase().includes(closerFilter)) return false;
        if (motivoFilter && !(r.motivo_nao_fechamento ?? "").toLowerCase().includes(motivoFilter)) return false;
        if (onlyAtrasados && !r.atrasado) return false;
        return true;
      });

  const fetchBloco = async (isFollowUp: boolean) => {
    let q = supabase
      .from("vendas")
      .select(SELECT)
      .eq("vendeu", false)
      .eq("follow_up", isFollowUp);

    if (isFollowUp) {
      if (from) q = q.gte("follow_up_date", from);
      if (to) q = q.lte("follow_up_date", to);
      q = q
        .order("follow_up_date", { ascending: true })
        .order("follow_up_time", { ascending: true, nullsFirst: false });
    } else {
      if (from) q = q.gte("agendamentos.scheduled_date", from);
      if (to) q = q.lte("agendamentos.scheduled_date", to);
      q = q.order("created_at", { ascending: false });
    }

    const { data, error } = await q.limit(2000);
    if (error) throw new Error(error.message);
    const rows = applyFilters(data ?? []);
    return rows.slice(0, limit);

  };

  try {
    const [emAcompanhamento, naoAcompanhados] = await Promise.all([
      wantAcomp ? fetchBloco(true) : Promise.resolve([]),
      wantNao ? fetchBloco(false) : Promise.resolve([]),
    ]);

    const pipeline = emAcompanhamento.reduce(
      (sum, r) => sum + Number(r.valor_previsto ?? 0),
      0,
    );

    return json({
      sincronizado_em: new Date().toISOString(),
      hoje_brt: today,
      resumo: {
        total_em_acompanhamento: emAcompanhamento.length,
        total_atrasados: emAcompanhamento.filter((r) => r.atrasado).length,
        total_hoje: emAcompanhamento.filter((r) => r.hoje).length,
        total_nao_acompanhados: naoAcompanhados.length,
        valor_total_pipeline: pipeline,
      },
      em_acompanhamento: emAcompanhamento,
      nao_acompanhados: naoAcompanhados,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
