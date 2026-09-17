// GET /silva-bloqueios — leitura dos compromissos/bloqueios da agenda (auditoria externa).
// Params: since=YYYY-MM-DD (default hoje), ate=YYYY-MM-DD (default since+14d),
//         closer_id (opcional), incluir_removidos=1 (histórico de bloqueio apagado/liberado).
import { createClient } from "npm:@supabase/supabase-js@2";
import { addDays, applyBlockExceptions, spParts, weekdayOf } from "../_shared/disponibilidade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const truthy = (v: string | null) => ["1", "true", "sim"].includes((v ?? "").trim().toLowerCase());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ erro: "method_not_allowed" }, 405);

  const key = req.headers.get("x-api-key");
  const sdrKey = Deno.env.get("SDR_IA_API_KEY");
  const vendasKey = Deno.env.get("SILVA_VENDAS_API_KEY");
  if (!key || (key !== sdrKey && key !== vendasKey)) return json({ erro: "unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const hoje = spParts(new Date()).dateStr;
    const since = url.searchParams.get("since") ?? hoje;
    if (!isDate(since)) return json({ erro: "since_invalido", detalhe: "use YYYY-MM-DD" }, 400);
    const ate = url.searchParams.get("ate") ?? addDays(since, 14);
    if (!isDate(ate)) return json({ erro: "ate_invalido", detalhe: "use YYYY-MM-DD" }, 400);
    if (ate < since) return json({ erro: "intervalo_invalido" }, 400);
    const closerFilter = url.searchParams.get("closer_id");

    // Limite defensivo de 90 dias por consulta.
    const dias: string[] = [];
    for (let d = since; d <= ate && dias.length < 90; d = addDays(d, 1)) dias.push(d);

    const [closersRes, blocksRes, excRes] = await Promise.all([
      supabase.from("closers").select("id, name, email, active, em_treinamento"),
      supabase.from("closer_blocks")
        .select("id, closer_id, block_date, start_time, end_time, block_type, description, is_recurring, recurrence_weekday, created_at")
        .or(`and(is_recurring.eq.false,block_date.gte.${since},block_date.lte.${ate}),is_recurring.eq.true`),
      supabase.from("closer_block_exceptions")
        .select("closer_id, exception_date, start_time, end_time")
        .gte("exception_date", since).lte("exception_date", ate),
    ]);
    for (const r of [closersRes, blocksRes, excRes]) if (r.error) throw r.error;

    const closerById = new Map((closersRes.data ?? []).map((c) => [c.id as string, c]));
    const allBlocks = (blocksRes.data ?? []).filter((b) => !closerFilter || b.closer_id === closerFilter);

    // Quem criou/removeu: o histórico fica em audit_logs (entity_id = id do bloqueio).
    const { data: logs } = await supabase.from("audit_logs")
      .select("action, user_name, user_email, entity_id, details, created_at")
      .eq("entity_type", "closer_block").order("created_at", { ascending: false }).limit(2000);
    const criadoPor = new Map<string, { por: string | null; em: string | null }>();
    const removidoPor = new Map<string, { por: string | null; em: string | null }>();
    for (const l of logs ?? []) {
      const id = String(l.entity_id ?? "");
      if (!id) continue;
      const alvo = String(l.action).includes("delete") ? removidoPor : criadoPor;
      if (!alvo.has(id)) alvo.set(id, { por: l.user_name ?? l.user_email ?? null, em: l.created_at ?? null });
    }

    type Item = {
      data: string;
      hora_inicio: string;
      hora_fim: string;
      closer: string | null;
      closer_id: string | null;
      closer_ativo: boolean | null;
      tipo: string | null;
      descricao: string | null;
      recorrente: boolean;
      block_id: string;
      criado_em: string | null;
      criado_por: string | null;
    };
    const bloqueios: Item[] = [];
    for (const dia of dias) {
      const wd = weekdayOf(dia);
      const doDia = allBlocks.filter((b) =>
        b.is_recurring ? b.recurrence_weekday === wd : b.block_date === dia
      );
      const exc = (excRes.data ?? []).filter((e) => e.exception_date === dia)
        .map((e) => ({ closer_id: e.closer_id as string, start_time: e.start_time as string, end_time: e.end_time as string }));
      const efetivos = applyBlockExceptions(
        doDia.map((b) => ({ ...b, closer_id: b.closer_id as string, start_time: b.start_time as string, end_time: b.end_time as string })),
        exc,
      );
      for (const b of efetivos) {
        const c = b.closer_id ? closerById.get(b.closer_id) : null;
        bloqueios.push({
          data: dia,
          hora_inicio: String(b.start_time).slice(0, 5),
          hora_fim: String(b.end_time).slice(0, 5),
          closer: (c?.name as string) ?? null,
          closer_id: b.closer_id ?? null,
          closer_ativo: c ? Boolean(c.active) : null,
          tipo: (b.block_type as string) ?? null,
          descricao: (b.description as string) ?? null,
          recorrente: Boolean(b.is_recurring),
          block_id: String(b.id),
          criado_em: (b.created_at as string) ?? null,
          criado_por: criadoPor.get(String(b.id))?.por ?? null,
        });
      }
    }
    bloqueios.sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));

    const body: Record<string, unknown> = {
      since_used: since,
      ate_used: ate,
      dias: dias.length,
      count: bloqueios.length,
      gerado_em: new Date().toISOString(),
      bloqueios,
    };

    if (truthy(url.searchParams.get("incluir_removidos"))) {
      const { data: rels, error: relErr } = await supabase.from("closer_block_releases")
        .select("id, closer_id, release_date, start_time, end_time, original_block_type, original_description, original_block, exception_id, released_by_name, undone_at, created_at")
        .gte("release_date", since).lte("release_date", ate)
        .order("created_at", { ascending: false });
      if (relErr) throw relErr;
      body.removidos = (rels ?? [])
        .filter((r) => !closerFilter || r.closer_id === closerFilter)
        .map((r) => ({
          release_id: r.id,
          data: r.release_date,
          hora_inicio: String(r.start_time).slice(0, 5),
          hora_fim: String(r.end_time).slice(0, 5),
          closer: (closerById.get(r.closer_id as string)?.name as string) ?? null,
          closer_id: r.closer_id,
          tipo: r.original_block_type,
          descricao: r.original_description,
          // "liberado_so_nesta_data" = recorrência preservada; "apagado" = bloqueio removido.
          acao: r.exception_id ? "liberado_so_nesta_data" : "apagado",
          liberado_por: r.released_by_name,
          removido_em: r.created_at,
          desfeito_em: r.undone_at,
          recuperavel: !r.undone_at,
          bloqueio_original: r.original_block,
        }));
      body.removidos_count = (body.removidos as unknown[]).length;
    }

    return json(body);
  } catch (e) {
    console.error("silva-bloqueios error", e);
    return json({ erro: "internal_error", detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});
