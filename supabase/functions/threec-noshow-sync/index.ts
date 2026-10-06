// Envio diário de leads para campanhas/listas da 3C Plus, por REGRAS configuráveis no Admin.
// Disparo automático: pg_cron no horário salvo em app_settings.threec_schedule_time (header x-cron-secret).
// Disparo manual: gestor/moderador/supervisor pelo painel Admin.
// Body: { date?: "YYYY-MM-DD", dry_run?: boolean, rule_id?: uuid }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRM_DAILY_CRON_SECRET") ?? "";
const TOKEN = (Deno.env.get("THREEC_PLUS_API_TOKEN") ?? "").trim();
const BASE = "https://investidormarketing.3c.plus/api/v1";
const ACTIVE = ["agendada", "confirmada", "em_call", "pendente", "reagendada", "nao_confirmada"];
const NI = "não identificado";
const MAX_ITEMS = 1000;
const STATUS_LABEL: Record<string, string> = { no_show: "não compareceu", cancelada: "cancelada", realizada: "realizada" };

const brtDate = (offsetDays = 0) => {
  const d = new Date(Date.now() - 3 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const val = (v: unknown) => { const s = (v ?? "").toString().trim(); return s ? s : NI; };
const nk = (s?: string | null) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
function normPhone(raw: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

type Rule = {
  id: string; name: string; active: boolean; campaign_id: string; list_id: string;
  statuses: string[]; reasons: string[]; only_no_sale: boolean; nao_fechamento_reasons: string[];
  skip_future: boolean; dedupe: boolean; include_desqualificados: boolean;
};

// deno-lint-ignore no-explicit-any
async function runRule(admin: any, rule: Rule, runDate: string, dryRun: boolean, kind: string, triggeredBy: string | null, triggeredByName: string | null) {
  const { data: run, error: runErr } = await admin.from("threec_runs").insert({
    run_date: runDate, kind, dry_run: dryRun, triggered_by: triggeredBy, triggered_by_name: triggeredByName,
    rule_id: rule.id, rule_name: rule.name, lease_until: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).select("id").single();
  if (runErr || !run) return { rule: rule.name, error: runErr?.message ?? "Falha ao iniciar" };

  try {
    const statuses = rule.statuses?.length ? rule.statuses : ["no_show"];
    const { data: agsRaw } = await admin.from("agendamentos")
      .select("id, lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by, scheduled_date, status, cancellation_reason, cancellation_note, booking_channel, channel_type, produto_interesse, lead_desqualificado")
      .eq("scheduled_date", runDate).in("status", statuses).is("deleted_at", null).limit(MAX_ITEMS);
    let ags = agsRaw ?? [];

    // Motivos de não comparecimento/cancelamento
    const reasonSet = new Set((rule.reasons ?? []).map(nk));
    if (reasonSet.size) {
      ags = ags.filter((a: { status: string; cancellation_reason: string | null }) =>
        a.status === "realizada" || reasonSet.has(nk(a.cancellation_reason ?? "No-show")));
    }
    if (!rule.include_desqualificados) ags = ags.filter((a: { lead_desqualificado: boolean }) => !a.lead_desqualificado);

    // Realizadas: venda / motivos de não fechamento
    const realIds = ags.filter((a: { status: string }) => a.status === "realizada").map((a: { id: string }) => a.id);
    const vMap = new Map<string, { vendeu: boolean; motivo: string | null }[]>();
    if (realIds.length) {
      const { data: vs } = await admin.from("vendas").select("agendamento_id, vendeu, motivo_nao_fechamento").in("agendamento_id", realIds);
      for (const v of vs ?? []) {
        const arr = vMap.get(v.agendamento_id) ?? [];
        arr.push({ vendeu: v.vendeu, motivo: v.motivo_nao_fechamento });
        vMap.set(v.agendamento_id, arr);
      }
      const nfSet = new Set((rule.nao_fechamento_reasons ?? []).map(nk));
      ags = ags.filter((a: { id: string; status: string }) => {
        if (a.status !== "realizada") return true;
        const vs = vMap.get(a.id) ?? [];
        if (rule.only_no_sale && vs.some((v) => v.vendeu)) return false;
        if (nfSet.size && !vs.some((v) => !v.vendeu && nfSet.has(nk(v.motivo)))) return false;
        return true;
      });
    }

    let futureSet = new Set<string>();
    if (rule.skip_future) {
      const { data: futures } = await admin.from("agendamentos").select("lead_phone")
        .gt("scheduled_date", runDate).in("status", ACTIVE).is("deleted_at", null).limit(20000);
      futureSet = new Set((futures ?? []).map((f: { lead_phone: string }) => normPhone(f.lead_phone)).filter(Boolean) as string[]);
    }

    const closerIds = [...new Set(ags.map((a: { closer_id: string | null }) => a.closer_id).filter(Boolean))];
    const sdrIds = [...new Set(ags.map((a: { sdr_responsavel_id: string | null; created_by: string | null }) => a.sdr_responsavel_id ?? a.created_by).filter(Boolean))];
    const { data: closers } = closerIds.length ? await admin.from("closers").select("id, name").in("id", closerIds) : { data: [] };
    const { data: sdrs } = sdrIds.length ? await admin.from("profiles").select("user_id, full_name").in("user_id", sdrIds) : { data: [] };
    const cMap = new Map((closers ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    const sMap = new Map((sdrs ?? []).map((s: { user_id: string; full_name: string }) => [s.user_id, s.full_name]));

    let sentSet = new Set<string>();
    if (rule.dedupe) {
      const phones = ags.map((a: { lead_phone: string }) => normPhone(a.lead_phone)).filter(Boolean) as string[];
      const { data: already } = phones.length
        ? await admin.from("threec_sent").select("telefone").eq("list_id", rule.list_id).in("telefone", phones) : { data: [] };
      sentSet = new Set((already ?? []).map((r: { telefone: string }) => r.telefone));
    }

    const items: Record<string, unknown>[] = [];
    const toSend: { ag: { id: string; lead_name: string }; tel: string; row: Record<string, string> }[] = [];
    const seen = new Set<string>();
    let skippedFuture = 0, skippedInvalid = 0, skippedDup = 0;

    for (const a of ags) {
      const tel = normPhone(a.lead_phone);
      const base = { run_id: run.id, agendamento_id: a.id, lead_name: a.lead_name, telefone: tel ?? a.lead_phone };
      if (!tel) { skippedInvalid++; items.push({ ...base, result: "telefone_invalido" }); continue; }
      if (futureSet.has(tel)) { skippedFuture++; items.push({ ...base, result: "ignorado_reuniao_futura" }); continue; }
      if (sentSet.has(tel) || seen.has(tel)) { skippedDup++; items.push({ ...base, result: "ja_enviado" }); continue; }
      seen.add(tel);
      const motivo = a.status === "realizada"
        ? (vMap.get(a.id) ?? []).find((v) => !v.vendeu)?.motivo
        : (a.cancellation_reason ?? a.cancellation_note ?? "No-show");
      toSend.push({
        ag: a, tel,
        row: {
          identifier: a.id,
          areacodephone: tel.slice(2),
          nome_lead: val(a.lead_name),
          telefone: tel,
          data_ultimo_agendamento: brDate(a.scheduled_date),
          status_ultimo_agendamento: STATUS_LABEL[a.status] ?? a.status,
          ultimo_closer: val(a.closer_id ? cMap.get(a.closer_id) : null),
          ultimo_sdr: val(sMap.get(a.sdr_responsavel_id ?? a.created_by ?? "")),
          motivo_cancelamento_ou_noshow: val(motivo),
          canal_origem: val(a.booking_channel ?? a.channel_type),
          produto_interesse: val(a.produto_interesse),
        },
      });
    }

    let sent = 0, failed = 0, runError: string | null = null;
    if (toSend.length) {
      if (dryRun) {
        for (const s of toSend) items.push({ run_id: run.id, agendamento_id: s.ag.id, lead_name: s.ag.lead_name, telefone: s.tel, result: "simulado" });
      } else {
        const header = Object.keys(toSend[0].row);
        const url = `${BASE}/campaigns/${encodeURIComponent(rule.campaign_id)}/lists/${encodeURIComponent(rule.list_id)}/mailing.json?api_token=${encodeURIComponent(TOKEN)}`;
        let status = 0, text = "";
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ header, mailing: toSend.map((s) => s.row) }),
            signal: AbortSignal.timeout(30_000),
          });
          status = r.status; text = (await r.text()).slice(0, 1000);
        } catch (e) { text = String(e).slice(0, 500); }
        const ok = status >= 200 && status < 300;
        if (!ok) runError = `3C Plus respondeu ${status || "sem resposta"}: ${text.slice(0, 300)}`;
        for (const s of toSend) {
          items.push({ run_id: run.id, agendamento_id: s.ag.id, lead_name: s.ag.lead_name, telefone: s.tel, result: ok ? "enviado" : "erro_api", status_code: status || null, response: text });
        }
        if (ok) {
          sent = toSend.length;
          await admin.from("threec_sent").upsert(
            toSend.map((s) => ({ list_id: rule.list_id, telefone: s.tel, rule_id: rule.id, agendamento_id: s.ag.id })),
            { onConflict: "list_id,telefone" },
          );
        } else failed = toSend.length;
      }
    }

    if (items.length) await admin.from("threec_run_items").insert(items);
    await admin.from("threec_runs").update({
      status: runError ? "error" : "done", total: ags.length, sent, failed,
      skipped_future: skippedFuture, skipped_invalid: skippedInvalid, skipped_duplicate: skippedDup,
      error: runError, finished_at: new Date().toISOString(), lease_until: null,
    }).eq("id", run.id);
    return { rule: rule.name, total: ags.length, eligible: toSend.length, sent, failed, skipped_future: skippedFuture, error: runError };
  } catch (e) {
    await admin.from("threec_runs").update({ status: "error", error: String(e).slice(0, 500), finished_at: new Date().toISOString(), lease_until: null }).eq("id", run.id);
    return { rule: rule.name, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { date?: string; dry_run?: boolean; rule_id?: string } = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const dryRun = body.dry_run === true;

  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  let isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  if (!isCron && cronHeader) {
    const { data } = await admin.from("app_settings").select("value").eq("key", "crm_daily_cron_token").maybeSingle();
    const t = (data?.value ?? "").trim();
    isCron = !!t && cronHeader === t;
  }
  let triggeredBy: string | null = null, triggeredByName: string | null = null, kind = "auto";
  if (!isCron) {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Não autenticado" }, 401);
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ud } = await uc.auth.getUser();
    const user = ud?.user;
    if (!user) return json({ error: "Não autenticado" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: { role: string }) => ["gestor", "moderador", "supervisor"].includes(r.role)))
      return json({ error: "Sem permissão" }, 403);
    const { data: p } = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    triggeredBy = user.id; triggeredByName = p?.full_name ?? user.email ?? null; kind = "manual";
  }

  const { data: cfgRows } = await admin.from("app_settings").select("key, value").in("key", ["threec_enabled", "threec_window"]);
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, (r.value ?? "").trim()]));
  if (isCron && cfg.threec_enabled !== "true") return json({ skipped: "desativado" });
  if (!TOKEN && !dryRun) return json({ error: "Token da 3C Plus não configurado" }, 400);

  const runDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : brtDate(cfg.threec_window === "d0" ? 0 : -1);

  let q = admin.from("threec_rules").select("*");
  if (body.rule_id) q = q.eq("id", body.rule_id); else q = q.eq("active", true);
  const { data: rules } = await q.order("created_at");
  if (!rules?.length) return json({ error: "Nenhuma regra ativa" }, 400);

  const { data: running } = await admin.from("threec_runs").select("id").eq("status", "running")
    .gt("lease_until", new Date().toISOString()).limit(1);
  if (running && running.length) return json({ error: "Já existe um envio em andamento" }, 409);

  const results = [];
  for (const r of rules as Rule[]) results.push(await runRule(admin, r, runDate, dryRun, kind, triggeredBy, triggeredByName));
  return json({ date: runDate, dry_run: dryRun, results });
});
