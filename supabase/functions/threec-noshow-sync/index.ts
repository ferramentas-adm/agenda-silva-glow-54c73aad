// Envio diário dos no-shows do dia para a campanha/lista da 3C Plus.
// Disparo automático: pg_cron às 23:59 BRT (02:59 UTC) com header x-cron-secret.
// Disparo manual: gestor/moderador/supervisor autenticado pelo painel Admin.
// Body: { date?: "YYYY-MM-DD", dry_run?: boolean }
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

const todayBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const val = (v: unknown) => {
  const s = (v ?? "").toString().trim();
  return s ? s : NI;
};
function normPhone(raw: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { date?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const runDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayBRT();
  const dryRun = body.dry_run === true;

  // ── Autorização ──
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

  // ── Configuração ──
  const { data: cfgRows } = await admin.from("app_settings").select("key, value")
    .in("key", ["threec_enabled", "threec_campaign_id", "threec_list_id"]);
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, (r.value ?? "").trim()]));
  const campaign = cfg.threec_campaign_id || "322695";
  const list = cfg.threec_list_id || "4945922";
  if (isCron && cfg.threec_enabled !== "true") return json({ skipped: "desativado" });
  if (!TOKEN && !dryRun) return json({ error: "Token da 3C Plus não configurado" }, 400);

  // ── Lock ──
  const { data: running } = await admin.from("threec_runs").select("id").eq("status", "running")
    .gt("lease_until", new Date().toISOString()).limit(1);
  if (running && running.length) return json({ error: "Já existe um envio em andamento" }, 409);

  const { data: run, error: runErr } = await admin.from("threec_runs").insert({
    run_date: runDate, kind, dry_run: dryRun, triggered_by: triggeredBy, triggered_by_name: triggeredByName,
    lease_until: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).select("id").single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Falha ao iniciar" }, 500);

  try {
    const { data: noShows } = await admin.from("agendamentos")
      .select("id, lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by, scheduled_date, status, cancellation_reason, cancellation_note, booking_channel, channel_type, produto_interesse")
      .eq("scheduled_date", runDate).eq("status", "no_show").is("deleted_at", null).limit(MAX_ITEMS);

    const { data: futures } = await admin.from("agendamentos").select("lead_phone")
      .gt("scheduled_date", runDate).in("status", ACTIVE).is("deleted_at", null).limit(20000);
    const futureSet = new Set((futures ?? []).map((f) => normPhone(f.lead_phone)).filter(Boolean));

    const closerIds = [...new Set((noShows ?? []).map((a) => a.closer_id).filter(Boolean))];
    const sdrIds = [...new Set((noShows ?? []).map((a) => a.sdr_responsavel_id ?? a.created_by).filter(Boolean))];
    const { data: closers } = closerIds.length ? await admin.from("closers").select("id, name").in("id", closerIds) : { data: [] };
    const { data: sdrs } = sdrIds.length ? await admin.from("profiles").select("user_id, full_name").in("user_id", sdrIds) : { data: [] };
    const cMap = new Map((closers ?? []).map((c) => [c.id, c.name]));
    const sMap = new Map((sdrs ?? []).map((s) => [s.user_id, s.full_name]));

    const phones = (noShows ?? []).map((a) => normPhone(a.lead_phone)).filter(Boolean) as string[];
    const { data: already } = phones.length ? await admin.from("threec_sent_phones").select("telefone").in("telefone", phones) : { data: [] };
    const sentSet = new Set((already ?? []).map((r) => r.telefone));

    const items: Record<string, unknown>[] = [];
    const toSend: { ag: { id: string; lead_name: string }; tel: string; row: Record<string, string> }[] = [];
    const seen = new Set<string>();
    let skippedFuture = 0, skippedInvalid = 0, skippedDup = 0;

    for (const a of noShows ?? []) {
      const tel = normPhone(a.lead_phone);
      const base = { run_id: run.id, agendamento_id: a.id, lead_name: a.lead_name, telefone: tel ?? a.lead_phone };
      if (!tel) { skippedInvalid++; items.push({ ...base, result: "telefone_invalido" }); continue; }
      if (futureSet.has(tel)) { skippedFuture++; items.push({ ...base, result: "ignorado_reuniao_futura" }); continue; }
      if (sentSet.has(tel) || seen.has(tel)) { skippedDup++; items.push({ ...base, result: "ja_enviado" }); continue; }
      seen.add(tel);
      toSend.push({
        ag: a, tel,
        row: {
          identifier: a.id,
          areacodephone: tel.slice(2),
          nome_lead: val(a.lead_name),
          telefone: tel,
          data_ultimo_agendamento: brDate(a.scheduled_date),
          status_ultimo_agendamento: "no_show",
          ultimo_closer: val(a.closer_id ? cMap.get(a.closer_id) : null),
          ultimo_sdr: val(sMap.get(a.sdr_responsavel_id ?? a.created_by ?? "")),
          motivo_cancelamento_ou_noshow: val(a.cancellation_reason ?? a.cancellation_note ?? "No-show"),
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
        const url = `${BASE}/campaigns/${encodeURIComponent(campaign)}/lists/${encodeURIComponent(list)}/mailing.json?api_token=${encodeURIComponent(TOKEN)}`;
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
          await admin.from("threec_sent_phones").upsert(toSend.map((s) => ({ telefone: s.tel, agendamento_id: s.ag.id })), { onConflict: "telefone" });
        } else failed = toSend.length;
      }
    }

    if (items.length) await admin.from("threec_run_items").insert(items);
    await admin.from("threec_runs").update({
      status: runError ? "error" : "done", total: (noShows ?? []).length, sent, failed,
      skipped_future: skippedFuture, skipped_invalid: skippedInvalid, skipped_duplicate: skippedDup,
      error: runError, finished_at: new Date().toISOString(), lease_until: null,
    }).eq("id", run.id);

    return json({ run_id: run.id, date: runDate, dry_run: dryRun, total: (noShows ?? []).length, eligible: toSend.length, sent, failed, skipped_future: skippedFuture, skipped_invalid: skippedInvalid, skipped_duplicate: skippedDup, error: runError });
  } catch (e) {
    await admin.from("threec_runs").update({ status: "error", error: String(e).slice(0, 500), finished_at: new Date().toISOString(), lease_until: null }).eq("id", run.id);
    return json({ error: String(e) }, 500);
  }
});
