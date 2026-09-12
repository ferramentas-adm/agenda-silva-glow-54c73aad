// Envio em lote (backfill) das vendas fechadas para o CRM.
// Reaproveita o mesmo formato de payload do webhook de resultado de venda,
// mas envia para uma URL de importação separada (app_settings.datacrazy_bulk_import_url).
//
// Ações:
//   { action: "preview", from, to }                -> lista as vendas do período
//   { action: "send", ids: string[] }              -> envia o bloco informado
//
// Somente gestor / moderador / supervisor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BULK_URL_KEY = "datacrazy_bulk_import_url";
const SEND_DELAY_MS = 150;
const ITEM_TIMEOUT_MS = 15_000;
const MAX_IDS_PER_CALL = 40;

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
  segunda_reuniao: boolean | null;
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

/** Data de atribuição da venda em BRT. */
function closingDate(v: VendaRow): string {
  if (v.closed_at) return v.closed_at;
  const d = new Date(new Date(v.created_at).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Não autenticado" }, 401);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const allowed = (roles ?? []).some((r: { role: string }) =>
    ["gestor", "moderador", "supervisor"].includes(r.role),
  );
  if (!allowed) return json({ error: "Sem permissão" }, 403);

  let body: { action?: string; from?: string; to?: string; ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  // ── Carrega vendas + agendamentos ──────────────────────────────


  const sel =
    "id, agendamento_id, vendeu, valor, valor_total_projeto, resumo_venda, observacoes, lead_revenue, venda_origem, follow_up, follow_up_date, follow_up_time, segunda_reuniao, order_bumps, closed_at, created_at";

  async function fetchPeriod(from: string, to: string): Promise<VendaRow[]> {
    // closed_at preenchido
    const byClosed = await admin
      .from("vendas")
      .select(sel)
      .eq("vendeu", true)
      .gte("closed_at", from)
      .lte("closed_at", to);
    // sem closed_at -> usa created_at (BRT, janela alargada em 1 dia de cada lado)
    const fromTs = `${from}T00:00:00-03:00`;
    const toTs = `${to}T23:59:59-03:00`;
    const byCreated = await admin
      .from("vendas")
      .select(sel)
      .eq("vendeu", true)
      .is("closed_at", null)
      .gte("created_at", fromTs)
      .lte("created_at", toTs);

    if (byClosed.error) throw new Error(byClosed.error.message);
    if (byCreated.error) throw new Error(byCreated.error.message);

    const rows = [...(byClosed.data ?? []), ...(byCreated.data ?? [])] as VendaRow[];
    return rows.filter((v) => {
      const d = closingDate(v);
      return d >= from && d <= to;
    });
  }

  async function hydrate(vendas: VendaRow[]) {
    const agIds = [...new Set(vendas.map((v) => v.agendamento_id))];
    const ags: AgRow[] = [];
    for (let i = 0; i < agIds.length; i += 200) {
      const { data, error } = await admin
        .from("agendamentos")
        .select(
          "id, lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by, channel_type, meeting_reason, scheduled_date, scheduled_time, is_venda_avulsa, deleted_at",
        )
        .in("id", agIds.slice(i, i + 200));
      if (error) throw new Error(error.message);
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
    return { agMap, closerMap, profileMap };
  }

  function buildPayload(
    v: VendaRow,
    ag: AgRow,
    closerName: string | null,
    sdrName: string | null,
  ) {
    return {
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
      scheduled_datetime: `${ag.scheduled_date}T${ag.scheduled_time}:00`,
      scheduled_date: ag.scheduled_date,
      scheduled_time: ag.scheduled_time.slice(0, 5),
      scheduled_timezone: "America/Sao_Paulo",
      closing_date: closingDate(v),
      registered_at: v.created_at,
      timestamp: new Date().toISOString(),
    };
  }

  // ── SAMPLE (payload de teste, sem enviar) ──────────────────────
  if (body.action === "sample") {
    try {
      let vendas: VendaRow[] = [];
      if (body.ids?.length) {
        const { data, error } = await admin.from("vendas").select(sel).in("id", body.ids.slice(0, 1));
        if (error) throw new Error(error.message);
        vendas = (data ?? []) as VendaRow[];
      } else {
        if (!body.from || !body.to) return json({ error: "Informe o período" }, 400);
        vendas = (await fetchPeriod(body.from, body.to)).slice(0, 1);
      }
      if (!vendas.length) return json({ error: "Nenhuma venda encontrada no período" }, 404);
      const { agMap, closerMap, profileMap } = await hydrate(vendas);
      const v = vendas[0];
      const ag = agMap.get(v.agendamento_id);
      if (!ag) return json({ error: "Agendamento não encontrado" }, 404);
      const payload = buildPayload(
        v,
        ag,
        ag.closer_id ? closerMap.get(ag.closer_id) ?? null : null,
        profileMap.get(ag.sdr_responsavel_id ?? "") ?? profileMap.get(ag.created_by ?? "") ?? null,
      );
      return json({ payload });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Erro ao montar payload" }, 500);
    }
  }

  // ── PREVIEW ────────────────────────────────────────────────────

  if (body.action === "preview") {
    const from = body.from;
    const to = body.to;
    if (!from || !to) return json({ error: "Informe o período" }, 400);
    try {
      const vendas = await fetchPeriod(from, to);
      const { agMap, closerMap, profileMap } = await hydrate(vendas);
      const items = vendas
        .map((v) => {
          const ag = agMap.get(v.agendamento_id);
          if (!ag || ag.deleted_at) return null;
          return {
            venda_id: v.id,
            lead_name: ag.lead_name,
            lead_phone: ag.lead_phone,
            closer_name: ag.closer_id ? closerMap.get(ag.closer_id) ?? null : null,
            sdr_name:
              profileMap.get(ag.sdr_responsavel_id ?? "") ??
              profileMap.get(ag.created_by ?? "") ??
              null,
            valor: v.valor,
            closing_date: closingDate(v),
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a!.closing_date).localeCompare(String(b!.closing_date)));
      return json({ total: items.length, items });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Erro na pré-visualização" }, 500);
    }
  }

  // ── SEND ───────────────────────────────────────────────────────
  if (body.action === "send") {
    const ids = (body.ids ?? []).filter((s) => typeof s === "string");
    if (!ids.length) return json({ error: "Nenhuma venda informada" }, 400);
    if (ids.length > MAX_IDS_PER_CALL) return json({ error: "Bloco muito grande" }, 400);

    const { data: setting } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", BULK_URL_KEY)
      .maybeSingle();
    const targetUrl = (setting?.value ?? "").trim();
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return json({ error: "Configure a URL de importação antes de enviar" }, 400);
    }

    const { data: vData, error: vErr } = await admin.from("vendas").select(sel).in("id", ids);
    if (vErr) return json({ error: vErr.message }, 500);
    const vendas = (vData ?? []) as VendaRow[];
    const { agMap, closerMap, profileMap } = await hydrate(vendas);

    const results: { venda_id: string; ok: boolean; status?: number; error?: string }[] = [];
    for (const v of vendas) {
      const ag = agMap.get(v.agendamento_id);
      if (!ag || ag.deleted_at) {
        results.push({ venda_id: v.id, ok: false, error: "agendamento_excluido" });
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
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          const res = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(ITEM_TIMEOUT_MS),
          });
          status = res.status;
          ok = res.ok;
          if (!ok) errMsg = (await res.text()).slice(0, 200);
        } catch (e) {
          errMsg = e instanceof Error ? e.message : "fetch_error";
        }
        if (!ok && attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
      results.push({ venda_id: v.id, ok, status, error: ok ? undefined : errMsg });
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }

    const sent = results.filter((r) => r.ok).length;
    console.log(`[crm-bulk-vendas] bloco enviado: ${sent}/${results.length}`);
    return json({ sent, failed: results.length - sent, results });
  }

  return json({ error: "Ação inválida" }, 400);
});
