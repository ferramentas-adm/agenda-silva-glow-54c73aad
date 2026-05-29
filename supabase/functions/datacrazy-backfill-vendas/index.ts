import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface BackfillParams {
  start_date: string;
  end_date?: string | null;
  only_with_motivo?: boolean;
  dry_run?: boolean;
  limit?: number | null; // hard cap on rows considered (test mode = 1)
  offset?: number; // cursor — process chunk starting here
  chunk_size?: number; // default 40
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const webhookUrl = Deno.env.get("DATACRAZY_WEBHOOK_URL");
  if (!webhookUrl) return json(500, { error: "DATACRAZY_WEBHOOK_URL not configured" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
  const token = authHeader.replace("Bearer ", "");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "invalid_token" });
  const userId = claimsData.claims.sub as string;
  const userEmail = (claimsData.claims.email as string) ?? "";

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isGestor } = await admin.rpc("has_role", { _user_id: userId, _role: "gestor" });
  if (!isGestor) return json(403, { error: "forbidden" });

  let params: BackfillParams;
  try {
    params = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!params.start_date) return json(400, { error: "start_date required" });

  const offset = Math.max(0, params.offset ?? 0);
  const chunkSize = Math.min(60, Math.max(1, params.chunk_size ?? 40));

  // ---- Fetch full list of candidate IDs first (cheap) ----
  // We paginate the SELECT so we can deterministically count + slice.
  const PAGE = 1000;
  let p = 0;
  const allRows: any[] = [];
  while (true) {
    let q = admin
      .from("vendas")
      .select(
        `id, agendamento_id, vendeu, valor, resumo_venda, motivo_nao_fechamento,
         explicacao_nao_fechamento, observacoes, follow_up, follow_up_date, follow_up_time,
         segunda_reuniao, lead_revenue, created_at,
         agendamentos!inner(id, lead_name, lead_phone, closer_id, sdr_responsavel_id,
                            created_by, status, scheduled_date, deleted_at)`,
      )
      .is("agendamentos.deleted_at", null)
      .eq("agendamentos.status", "realizada")
      .gte("agendamentos.scheduled_date", params.start_date)
      .order("created_at", { ascending: true })
      .range(p, p + PAGE - 1);
    if (params.end_date) q = q.lte("agendamentos.scheduled_date", params.end_date);
    if (params.only_with_motivo) q = q.not("motivo_nao_fechamento", "is", null);
    const { data, error } = await q;
    if (error) return json(500, { error: error.message });
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    p += PAGE;
  }

  let candidates = allRows;
  if (params.limit && params.limit > 0) candidates = candidates.slice(0, params.limit);
  const total = candidates.length;

  if (params.dry_run) {
    return json(200, { total, dry_run: true });
  }

  const chunk = candidates.slice(offset, offset + chunkSize);
  if (chunk.length === 0) {
    return json(200, { total, offset, processed: 0, sent: 0, failed: 0, done: true });
  }

  // Resolve closers/sdrs only for this chunk
  const closerIds = Array.from(new Set(chunk.map((r) => r.agendamentos?.closer_id).filter(Boolean)));
  const sdrIds = Array.from(
    new Set(
      chunk
        .map((r) => r.agendamentos?.sdr_responsavel_id ?? r.agendamentos?.created_by)
        .filter(Boolean),
    ),
  );
  const closerMap = new Map<string, string>();
  const sdrMap = new Map<string, string>();
  if (closerIds.length) {
    const { data: cs } = await admin.from("closers").select("id, name").in("id", closerIds);
    (cs ?? []).forEach((c: any) => closerMap.set(c.id, c.name));
  }
  if (sdrIds.length) {
    const { data: ps } = await admin.from("profiles").select("user_id, full_name").in("user_id", sdrIds);
    (ps ?? []).forEach((p: any) => sdrMap.set(p.user_id, p.full_name));
  }

  // Log chunk start
  if (offset === 0) {
    await admin.from("audit_logs").insert({
      user_id: userId,
      user_name: userEmail,
      action: "datacrazy_backfill_start",
      entity_type: "vendas",
      details: {
        total,
        start_date: params.start_date,
        end_date: params.end_date ?? null,
        only_with_motivo: !!params.only_with_motivo,
        limit: params.limit ?? null,
      },
    });
  }

  // Rate limit: 90 req/min => 1 req per ~670ms
  const MIN_INTERVAL_MS = 670;
  let sent = 0;
  let failed = 0;
  const errors: { agendamento_id: string; error: string }[] = [];

  for (let i = 0; i < chunk.length; i++) {
    const r = chunk[i];
    const ag = r.agendamentos;
    if (!ag) continue;
    const closerName = ag.closer_id ? closerMap.get(ag.closer_id) ?? null : null;
    const sdrLookup = ag.sdr_responsavel_id ?? ag.created_by;
    const sdrName = sdrLookup ? sdrMap.get(sdrLookup) ?? null : null;

    const vendeu = r.vendeu === true;
    const outcome: string = vendeu
      ? "fechou"
      : r.follow_up
      ? "follow_up"
      : r.motivo_nao_fechamento
      ? "perdeu"
      : "em_andamento";

    const payload = {
      event: "venda_resultado",
      source: "backfill",
      agendamento_id: ag.id,
      lead_name: ag.lead_name,
      lead_phone: ag.lead_phone ?? null,
      closer_name: closerName,
      sdr_name: sdrName,
      vendeu,
      resumo_venda: vendeu ? r.resumo_venda ?? null : null,
      valor: r.valor ?? null,
      motivo_nao_fechamento: r.motivo_nao_fechamento ?? null,
      explicacao_nao_fechamento: r.explicacao_nao_fechamento ?? null,
      follow_up: !!r.follow_up,
      follow_up_date: r.follow_up_date ?? null,
      follow_up_time: r.follow_up_time ?? null,
      segunda_reuniao: !!r.segunda_reuniao,
      observacoes: r.observacoes ?? null,
      outcome,
      registered_at: r.created_at,
      lead_revenue: r.lead_revenue ?? null,
    };

    const t0 = Date.now();
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        failed++;
        errors.push({ agendamento_id: ag.id, error: `HTTP ${res.status}` });
      } else {
        sent++;
      }
    } catch (e) {
      failed++;
      errors.push({ agendamento_id: ag.id, error: e instanceof Error ? e.message : String(e) });
    }

    if (i < chunk.length - 1) {
      const elapsed = Date.now() - t0;
      const wait = Math.max(0, MIN_INTERVAL_MS - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }

  const nextOffset = offset + chunk.length;
  const done = nextOffset >= total;

  await admin.from("audit_logs").insert({
    user_id: userId,
    user_name: userEmail,
    action: done ? "datacrazy_backfill_done" : "datacrazy_backfill_progress",
    entity_type: "vendas",
    details: { total, offset, processed: chunk.length, sent, failed, next_offset: nextOffset, errors: errors.slice(0, 10) },
  });

  return json(200, {
    total,
    offset,
    processed: chunk.length,
    sent,
    failed,
    next_offset: nextOffset,
    done,
    errors: errors.slice(0, 20),
  });
});
