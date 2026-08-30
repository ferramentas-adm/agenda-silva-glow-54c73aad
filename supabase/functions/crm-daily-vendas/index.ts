// Envio diário automático das vendas fechadas do dia anterior (BRT) para o CRM.
// Usa a MESMA URL de importação e o MESMO payload do painel "Envio em lote".
//
// Disparo automático: pg_cron às 00:00 BRT (03:00 UTC), com header x-cron-secret.
// Disparo manual: usuário autenticado gestor/moderador/supervisor pelo painel.
//
// Body:
//   { date?: "YYYY-MM-DD", force?: boolean, kind?: "auto" | "manual" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRM_DAILY_CRON_SECRET") ?? "";

const BULK_URL_KEY = "datacrazy_bulk_import_url";
const SEND_DELAY_MS = 150;
const ITEM_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_RUN = 500; // limite de trabalho por execução
const LEASE_MINUTES = 15;

interface VendaRow {
  id: string;
  agendamento_id: string;
  vendeu: boolean;
  valor: number | null;
  valor_total_projeto: number | null;
  resumo_venda: string | null;
  observacoes: string | null;
  lead_revenue: string | null;
  venda_origem: string | null;
  follow_up: boolean | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  order_bumps: unknown;
  closed_at: string | null;
  created_at: string;
}

interface AgRow {
  id: string;
  lead_name: string;
  lead_phone: string;
  closer_id: string | null;
  sdr_responsavel_id: string | null;
  created_by: string | null;
  channel_type: string | null;
  meeting_reason: string | null;
  scheduled_date: string;
  scheduled_time: string;
  is_venda_avulsa: boolean | null;
  deleted_at: string | null;
}

const SEL =
  "id, agendamento_id, vendeu, valor, valor_total_projeto, resumo_venda, observacoes, lead_revenue, venda_origem, follow_up, follow_up_date, follow_up_time, order_bumps, closed_at, created_at";

/** Data de atribuição da venda em BRT. */
function closingDate(v: VendaRow): string {
  if (v.closed_at) return v.closed_at;
  const d = new Date(new Date(v.created_at).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Ontem em BRT (America/Sao_Paulo, UTC-3). */
function yesterdayBRT(): string {
  const nowBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  nowBrt.setUTCDate(nowBrt.getUTCDate() - 1);
  return nowBrt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { date?: string; force?: boolean; kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Autorização ────────────────────────────────────────────────
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

  let triggeredBy: string | null = null;
  let triggeredByName: string | null = null;
  let kind = "auto";

  if (!isCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Não autenticado" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const allowed = (roles ?? []).some((r: { role: string }) =>
      ["gestor", "moderador", "supervisor"].includes(r.role),
    );
    if (!allowed) return json({ error: "Sem permissão" }, 403);

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    triggeredBy = user.id;
    triggeredByName = profile?.full_name ?? user.email ?? null;
    kind = "manual";
  }

  const runDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : yesterdayBRT();
  const force = !!body.force;

  // ── Single-flight: nenhuma execução simultânea ─────────────────
  const { data: running } = await admin
    .from("crm_daily_runs")
    .select("id, run_date, started_at, lease_until")
    .eq("status", "running")
    .gt("lease_until", new Date().toISOString())
    .limit(1);
  if (running?.length) {
    return json(
      { skipped: true, reason: "already_running", run_id: running[0].id, run_date: running[0].run_date },
      200,
    );
  }

  // Libera execuções travadas (lease expirado)
  await admin
    .from("crm_daily_runs")
    .update({
      status: "failed",
      error: "Execução interrompida (lease expirado)",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lte("lease_until", new Date().toISOString());

  // ── URL de destino ─────────────────────────────────────────────
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", BULK_URL_KEY)
    .maybeSingle();
  const targetUrl = (setting?.value ?? "").trim();

  const startRun = async (status: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin
      .from("crm_daily_runs")
      .insert({
        run_date: runDate,
        kind,
        status,
        forced: force,
        triggered_by: triggeredBy,
        triggered_by_name: triggeredByName,
        lease_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    const id = await startRun("failed", {
      error: "URL de importação do CRM não configurada",
      finished_at: new Date().toISOString(),
      lease_until: null,
    });
    return json({ error: "URL de importação do CRM não configurada", run_id: id }, 400);
  }

  // ── Vendas fechadas do dia ─────────────────────────────────────
  const fromTs = `${runDate}T00:00:00-03:00`;
  const toTs = `${runDate}T23:59:59-03:00`;

  const byClosed = await admin
    .from("vendas")
    .select(SEL)
    .eq("vendeu", true)
    .eq("closed_at", runDate);
  const byCreated = await admin
    .from("vendas")
    .select(SEL)
    .eq("vendeu", true)
    .is("closed_at", null)
    .gte("created_at", fromTs)
    .lte("created_at", toTs);

  if (byClosed.error || byCreated.error) {
    const msg = byClosed.error?.message ?? byCreated.error?.message ?? "Erro ao carregar vendas";
    const id = await startRun("failed", {
      error: msg,
      finished_at: new Date().toISOString(),
      lease_until: null,
    });
    return json({ error: msg, run_id: id }, 500);
  }

  const seen = new Set<string>();
  let vendas = [...(byClosed.data ?? []), ...(byCreated.data ?? [])]
    .filter((v) => {
      if (seen.has((v as VendaRow).id)) return false;
      seen.add((v as VendaRow).id);
      return closingDate(v as VendaRow) === runDate;
    })
    .map((v) => v as VendaRow);

  // Idempotência: pula vendas já enviadas com sucesso para essa data, salvo `force`
  let alreadySent = 0;
  if (!force && vendas.length) {
    const { data: done } = await admin
      .from("crm_daily_run_items")
      .select("venda_id")
      .eq("run_date", runDate)
      .eq("ok", true);
    const doneIds = new Set((done ?? []).map((d: { venda_id: string }) => d.venda_id));
    const before = vendas.length;
    vendas = vendas.filter((v) => !doneIds.has(v.id));
    alreadySent = before - vendas.length;
  }

  const bounded = vendas.slice(0, MAX_ITEMS_PER_RUN);

  const runId = await startRun("running", { total: bounded.length, skipped: alreadySent });

  if (!bounded.length) {
    await admin
      .from("crm_daily_runs")
      .update({
        status: "success",
        total: 0,
        sent: 0,
        failed: 0,
        finished_at: new Date().toISOString(),
        lease_until: null,
        error: alreadySent > 0 ? null : "Nenhuma venda fechada no dia",
      })
      .eq("id", runId);
    return json({ run_id: runId, run_date: runDate, total: 0, sent: 0, failed: 0, skipped: alreadySent });
  }

  // ── Hidratação (agendamentos / closers / SDRs) ─────────────────
  const agIds = [...new Set(bounded.map((v) => v.agendamento_id))];
  const ags: AgRow[] = [];
  for (let i = 0; i < agIds.length; i += 200) {
    const { data } = await admin
      .from("agendamentos")
      .select(
        "id, lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by, channel_type, meeting_reason, scheduled_date, scheduled_time, is_venda_avulsa, deleted_at",
      )
      .in("id", agIds.slice(i, i + 200));
    ags.push(...((data ?? []) as AgRow[]));
  }
  const agMap = new Map(ags.map((a) => [a.id, a]));

  const closerIds = [...new Set(ags.map((a) => a.closer_id).filter(Boolean))] as string[];
  const userIds = [
    ...new Set(ags.flatMap((a) => [a.sdr_responsavel_id, a.created_by]).filter(Boolean)),
  ] as string[];

  const closerMap = new Map<string, string>();
  if (closerIds.length) {
    const { data } = await admin.from("closers").select("id, name").in("id", closerIds);
    (data ?? []).forEach((c: { id: string; name: string }) => closerMap.set(c.id, c.name));
  }
  const profileMap = new Map<string, string>();
  if (userIds.length) {
    const { data } = await admin.from("profiles").select("user_id, full_name").in("user_id", userIds);
    (data ?? []).forEach((p: { user_id: string; full_name: string }) =>
      profileMap.set(p.user_id, p.full_name),
    );
  }

  const buildPayload = (v: VendaRow, ag: AgRow, closerName: string | null, sdrName: string | null) => ({
    event: "venda_resultado_lote",
    backfill: true,
    agendamento_id: ag.id,
    venda_id: v.id,
    lead_name: ag.lead_name,
    lead_phone: ag.lead_phone ?? null,
    closer_name: closerName ?? null,
    sdr_name: sdrName ?? null,
    vendeu: true,
    resumo_venda: v.resumo_venda ?? null,
    valor: v.valor ?? null,
    valor_total_projeto: v.valor_total_projeto ?? null,
    motivo_nao_fechamento: null,
    venda_origem: v.venda_origem ?? null,
    explicacao_nao_fechamento: null,
    follow_up: !!v.follow_up,
    follow_up_date: v.follow_up_date ?? null,
    follow_up_time: v.follow_up_time ?? null,
    observacoes: v.observacoes ?? null,
    order_bumps: v.order_bumps ?? null,
    lead_revenue: v.lead_revenue ?? null,
    channel_type: ag.channel_type ?? null,
    meeting_reason: ag.meeting_reason ?? null,
    is_venda_avulsa: !!ag.is_venda_avulsa,
    outcome: "fechou",
    status: "Vendido",
    is_vendeu: true,
    evento: "status_atualizado",
    pipeline_acao: "reuniao_realizada",
    status_novo: "realizada",
    scheduled_datetime: `${ag.scheduled_date}T${ag.scheduled_time}:00Z`,
    closing_date: closingDate(v),
    registered_at: v.created_at,
    timestamp: new Date().toISOString(),
  });

  // ── Envio sequencial ──────────────────────────────────────────
  let sent = 0;
  let failed = 0;

  for (const v of bounded) {
    const ag = agMap.get(v.agendamento_id);
    if (!ag || ag.deleted_at) {
      failed++;
      await admin.from("crm_daily_run_items").upsert(
        {
          run_id: runId,
          run_date: runDate,
          venda_id: v.id,
          agendamento_id: v.agendamento_id,
          lead_name: ag?.lead_name ?? null,
          valor: v.valor,
          ok: false,
          error: ag ? "Agendamento excluído (soft delete)" : "Agendamento não encontrado",
          attempts: 0,
        },
        { onConflict: "run_id,venda_id" },
      );
      continue;
    }

    const payload = buildPayload(
      v,
      ag,
      ag.closer_id ? closerMap.get(ag.closer_id) ?? null : null,
      profileMap.get(ag.sdr_responsavel_id ?? "") ?? profileMap.get(ag.created_by ?? "") ?? null,
    );

    let ok = false;
    let status: number | undefined;
    let errMsg: string | undefined;
    let attempts = 0;

    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      attempts++;
      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(ITEM_TIMEOUT_MS),
        });
        status = res.status;
        ok = res.ok;
        if (!ok) errMsg = `HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`;
      } catch (e) {
        errMsg =
          e instanceof Error
            ? e.name === "TimeoutError"
              ? `Tempo limite de ${ITEM_TIMEOUT_MS / 1000}s excedido`
              : e.message
            : "Falha de rede";
      }
      if (!ok && attempt === 0) await new Promise((r) => setTimeout(r, 500));
    }

    if (ok) sent++;
    else failed++;

    await admin.from("crm_daily_run_items").upsert(
      {
        run_id: runId,
        run_date: runDate,
        venda_id: v.id,
        agendamento_id: ag.id,
        lead_name: ag.lead_name,
        lead_phone: ag.lead_phone,
        closer_name: ag.closer_id ? closerMap.get(ag.closer_id) ?? null : null,
        valor: v.valor,
        ok,
        status_code: status ?? null,
        error: ok ? null : errMsg ?? "Erro desconhecido",
        attempts,
      },
      { onConflict: "run_id,venda_id" },
    );

    await admin
      .from("crm_daily_runs")
      .update({
        sent,
        failed,
        lease_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
      })
      .eq("id", runId);

    await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
  }

  const finalStatus = failed === 0 ? "success" : sent === 0 ? "failed" : "partial";
  await admin
    .from("crm_daily_runs")
    .update({
      status: finalStatus,
      sent,
      failed,
      finished_at: new Date().toISOString(),
      lease_until: null,
    })
    .eq("id", runId);

  console.log(`[crm-daily-vendas] ${runDate} (${kind}): ${sent} enviadas, ${failed} falhas`);
  return json({
    run_id: runId,
    run_date: runDate,
    total: bounded.length,
    sent,
    failed,
    skipped: alreadySent,
    status: finalStatus,
  });
});
