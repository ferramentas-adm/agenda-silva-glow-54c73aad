// Exportação diária dos motivos de não fechamento para o Google Sheets.
//
// - Uma planilha por mês (YYYY-MM), criada automaticamente.
// - Uma aba por dia (DD-MM-YYYY) com os leads que não fecharam naquele dia.
// - Reenvio do mesmo dia reescreve a aba (idempotente).
//
// Disparo automático: pg_cron 02:10 BRT com header x-cron-secret.
// Disparo manual: gestor/moderador/supervisor pelo painel de Administração.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SHEETS_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY") ?? "";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const LEASE_MINUTES = 10;
const MAX_ROWS = 2000;

const HEADERS = [
  "Data da reunião",
  "Hora",
  "Lead",
  "Telefone",
  "Closer",
  "SDR",
  "Origem do lead",
  "Canal do agendamento",
  "Motivo de não fechamento",
  "Justificativa",
  "Valor apresentado",
  "Faturamento do lead",
  "Data do lançamento",
  "Fechou depois?",
];

/** Ontem em BRT (America/Sao_Paulo, UTC-3). */
function yesterdayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const monthOf = (ymd: string) => ymd.slice(0, 7);
const sheetTitleOf = (ymd: string) => ymd.split("-").reverse().join("-");
const dateBR = (ymd: string | null) => (ymd ? ymd.split("-").reverse().join("/") : "");

// Telefone no padrão 5511998765432 (só dígitos, com DDI 55 quando faz sentido).
const formatPhoneE164BR = (raw: string | null | undefined) => {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

async function sheets(
  path: string,
  init: { method?: string; body?: unknown; query?: string } = {},
) {
  const url = `${GATEWAY}${path}${init.query ? `?${init.query}` : ""}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SHEETS_KEY,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[sheets] ${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
    throw new Error(`Google Sheets [${res.status}]: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

interface VendaRow {
  id: string;
  agendamento_id: string;
  motivo_nao_fechamento: string | null;
  observacoes: string | null;
  valor: number | null;
  lead_revenue: string | null;
  closed_at: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: { date?: string; kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Autorização ────────────────────────────────────────────────
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  let isCron = false;
  if (cronHeader) {
    const { data: tokenRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "sheets_motivos_cron_token")
      .maybeSingle();
    const token = (tokenRow?.value ?? "").trim();
    isCron = !!token && cronHeader === token;
  }

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

  if (!LOVABLE_API_KEY || !SHEETS_KEY) {
    return json({ error: "Conexão do Google Sheets não configurada no projeto" }, 400);
  }

  const runDate =
    body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : yesterdayBRT();
  const month = monthOf(runDate);
  const sheetTitle = sheetTitleOf(runDate);
  const nowIso = new Date().toISOString();

  // ── Single-flight ──────────────────────────────────────────────
  const { data: running } = await admin
    .from("sheets_motivos_runs")
    .select("id, run_date")
    .eq("status", "running")
    .gt("lease_until", nowIso)
    .limit(1);
  if (running?.length) {
    return json({ skipped: true, reason: "already_running", run_date: running[0].run_date });
  }
  await admin
    .from("sheets_motivos_runs")
    .update({
      status: "failed",
      error: "Execução interrompida (lease expirado)",
      finished_at: nowIso,
      lease_until: null,
    })
    .eq("status", "running")
    .lte("lease_until", nowIso);

  const { data: run, error: runErr } = await admin
    .from("sheets_motivos_runs")
    .upsert(
      {
        run_date: runDate,
        kind,
        status: "running",
        rows: 0,
        month,
        sheet_title: sheetTitle,
        error: null,
        started_at: nowIso,
        finished_at: null,
        lease_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
        triggered_by: triggeredBy,
        triggered_by_name: triggeredByName,
      },
      { onConflict: "run_date" },
    )
    .select("id")
    .single();
  if (runErr) return json({ error: runErr.message }, 500);
  const runId = run.id as string;

  const fail = async (msg: string, status = 500) => {
    await admin
      .from("sheets_motivos_runs")
      .update({
        status: "failed",
        error: msg.slice(0, 2000),
        finished_at: new Date().toISOString(),
        lease_until: null,
      })
      .eq("id", runId);
    return json({ error: msg, run_date: runDate }, status);
  };

  try {
    // ── Dados do dia (atribuídos pela data da reunião) ────────────
    const { data: ags, error: agErr } = await admin
      .from("agendamentos")
      .select(
        "id, lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by, channel_type, booking_channel, scheduled_date, scheduled_time",
      )
      .eq("scheduled_date", runDate)
      .is("deleted_at", null);
    if (agErr) return await fail(agErr.message);

    const agList = ags ?? [];
    const rowsData: string[][] = [];
    const motivoCount = new Map<string, number>();

    if (agList.length) {
      const agMap = new Map(agList.map((a) => [a.id, a]));
      const vendas: VendaRow[] = [];
      const ids = agList.map((a) => a.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin
          .from("vendas")
          .select(
            "id, agendamento_id, motivo_nao_fechamento, observacoes, valor, lead_revenue, closed_at, created_at",
          )
          .eq("vendeu", false)
          .not("motivo_nao_fechamento", "is", null)
          .in("agendamento_id", ids.slice(i, i + 200));
        if (error) return await fail(error.message);
        vendas.push(...((data ?? []) as VendaRow[]));
      }

      const closerIds = [
        ...new Set(agList.map((a) => a.closer_id).filter(Boolean)),
      ] as string[];
      const userIds = [
        ...new Set(
          agList.flatMap((a) => [a.sdr_responsavel_id, a.created_by]).filter(Boolean),
        ),
      ] as string[];

      const closerMap = new Map<string, string>();
      if (closerIds.length) {
        const { data } = await admin.from("closers").select("id, name").in("id", closerIds);
        (data ?? []).forEach((c: { id: string; name: string }) => closerMap.set(c.id, c.name));
      }
      const profileMap = new Map<string, string>();
      if (userIds.length) {
        const { data } = await admin
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        (data ?? []).forEach((p: { user_id: string; full_name: string }) =>
          profileMap.set(p.user_id, p.full_name),
        );
      }

      // ── Fechamento posterior do mesmo lead ───────────────────────
      // Telefone normalizado -> data (ymd BRT) do primeiro fechamento com
      // vendeu = true e valor > 0 (nova reunião ou venda avulsa).
      const normPhone = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");
      const brtYmd = (iso: string) =>
        new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const closeByPhone = new Map<string, string>();
      const phones = [
        ...new Set(agList.map((a) => normPhone(a.lead_phone)).filter(Boolean)),
      ];
      for (let i = 0; i < phones.length; i += 200) {
        const { data, error } = await admin
          .from("vendas")
          .select("valor, closed_at, created_at, agendamentos!inner(lead_phone, deleted_at)")
          .eq("vendeu", true)
          .gt("valor", 0)
          .is("agendamentos.deleted_at", null)
          .in("agendamentos.lead_phone", phones.slice(i, i + 200));
        if (error) return await fail(error.message);
        for (const r of (data ?? []) as {
          closed_at: string | null;
          created_at: string;
          agendamentos?: { lead_phone: string | null };
        }[]) {
          const phone = normPhone(r.agendamentos?.lead_phone);
          if (!phone) continue;
          const ymd = r.closed_at ?? brtYmd(r.created_at);
          const cur = closeByPhone.get(phone);
          if (!cur || ymd < cur) closeByPhone.set(phone, ymd);
        }
      }

      const sorted = vendas
        .map((v) => ({ v, ag: agMap.get(v.agendamento_id)! }))
        .filter((r) => !!r.ag)
        .sort((a, b) => (a.ag.scheduled_time ?? "").localeCompare(b.ag.scheduled_time ?? ""));

      for (const { v, ag } of sorted.slice(0, MAX_ROWS)) {
        const motivo = v.motivo_nao_fechamento ?? "";
        motivoCount.set(motivo, (motivoCount.get(motivo) ?? 0) + 1);
        const sdrId = ag.sdr_responsavel_id ?? ag.created_by ?? null;
        const closeYmd = closeByPhone.get(normPhone(ag.lead_phone));
        const fechouDepois =
          closeYmd && closeYmd > ag.scheduled_date ? `Sim — ${dateBR(closeYmd)}` : "Não";
        rowsData.push([
          dateBR(ag.scheduled_date),
          ag.scheduled_time ?? "",
          ag.lead_name ?? "",
          ag.lead_phone ?? "",
          ag.closer_id ? closerMap.get(ag.closer_id) ?? "" : "",
          sdrId ? profileMap.get(sdrId) ?? "" : "",
          ag.channel_type ?? "",
          ag.booking_channel ?? "",
          motivo,
          v.observacoes ?? "",
          v.valor != null ? String(v.valor) : "",
          v.lead_revenue ?? "",
          dateBR(v.closed_at ?? v.created_at.slice(0, 10)),
          fechouDepois,
        ]);
      }
    }

    // ── Planilha do mês ──────────────────────────────────────────
    const { data: existing } = await admin
      .from("sheets_motivos_exports")
      .select("spreadsheet_id, spreadsheet_url")
      .eq("month", month)
      .maybeSingle();

    let spreadsheetId = existing?.spreadsheet_id ?? null;
    let spreadsheetUrl = existing?.spreadsheet_url ?? null;

    if (spreadsheetId) {
      try {
        await sheets(`/spreadsheets/${spreadsheetId}`, {
          query: "fields=spreadsheetId",
        });
      } catch {
        spreadsheetId = null;
        spreadsheetUrl = null;
      }
    }

    if (!spreadsheetId) {
      const [y, m] = month.split("-");
      const created = await sheets("/spreadsheets", {
        method: "POST",
        body: {
          properties: { title: `Motivos de Não Fechamento — ${m}/${y}` },
          sheets: [{ properties: { title: sheetTitle } }],
        },
      });
      spreadsheetId = created.spreadsheetId as string;
      spreadsheetUrl =
        (created.spreadsheetUrl as string) ??
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      await admin
        .from("sheets_motivos_exports")
        .upsert(
          { month, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl },
          { onConflict: "month" },
        );
    }

    // ── Aba do dia ───────────────────────────────────────────────
    const meta = await sheets(`/spreadsheets/${spreadsheetId}`, {
      query: "fields=sheets.properties",
    });
    const tabs = (meta.sheets ?? []) as { properties: { title: string; sheetId: number } }[];
    const tab = tabs.find((s) => s.properties.title === sheetTitle);

    if (!tab) {
      await sheets(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
      });
    } else {
      await sheets(`/spreadsheets/${spreadsheetId}/values/${sheetTitle}:clear`, {
        method: "POST",
        body: {},
      });
    }

    // ── Escrita ──────────────────────────────────────────────────
    const totals = [...motivoCount.entries()].sort((a, b) => b[1] - a[1]);
    const resumo = totals.length
      ? totals.map(([m, n]) => `${m}: ${n}`).join(" · ")
      : "Nenhum motivo de não fechamento registrado neste dia";

    const values: string[][] = [
      [`Motivos de não fechamento — ${dateBR(runDate)}`, `Total: ${rowsData.length}`],
      [resumo],
      [],
      HEADERS,
      ...rowsData,
    ];

    await sheets(`/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1`, {
      method: "PUT",
      query: "valueInputOption=USER_ENTERED",
      body: { range: `${sheetTitle}!A1`, majorDimension: "ROWS", values },
    });

    await admin
      .from("sheets_motivos_runs")
      .update({
        status: "success",
        rows: rowsData.length,
        month,
        sheet_title: sheetTitle,
        spreadsheet_url: spreadsheetUrl,
        error: null,
        finished_at: new Date().toISOString(),
        lease_until: null,
      })
      .eq("id", runId);

    return json({
      run_date: runDate,
      rows: rowsData.length,
      month,
      sheet_title: sheetTitle,
      spreadsheet_url: spreadsheetUrl,
    });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : "Falha na exportação");
  }
});
