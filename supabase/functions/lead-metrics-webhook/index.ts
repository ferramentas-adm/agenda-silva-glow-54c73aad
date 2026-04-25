// Edge function pública para receber métricas de leads de projetos externos.
// Validação por header Authorization: Bearer <EXTERNAL_WEBHOOK_TOKEN>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface LeadMetricsPayload {
  origem?: string;
  evento?: string;
  periodo?: string;
  data_utc?: string;
  enviado_em?: string;
  leads_iniciados?: number;
  leads_finalizados?: number;
  taxa_conclusao?: number;
  [key: string]: unknown;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── Validação do token ──
  const expectedToken = Deno.env.get("EXTERNAL_WEBHOOK_TOKEN");
  if (!expectedToken) {
    console.error("[lead-metrics-webhook] EXTERNAL_WEBHOOK_TOKEN não configurado");
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, "").trim();
  const tokenFromQuery = new URL(req.url).searchParams.get("token") ?? "";
  const provided = tokenFromHeader || tokenFromQuery;

  if (provided !== expectedToken) {
    console.warn("[lead-metrics-webhook] Token inválido ou ausente");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Parse + validação básica ──
  let payload: LeadMetricsPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const {
    origem,
    evento,
    periodo,
    data_utc,
    enviado_em,
    leads_iniciados,
    leads_finalizados,
    taxa_conclusao,
  } = payload;

  if (!origem || typeof origem !== "string") {
    return jsonResponse({ error: "Campo 'origem' é obrigatório" }, 400);
  }
  if (!evento || typeof evento !== "string") {
    return jsonResponse({ error: "Campo 'evento' é obrigatório" }, 400);
  }
  if (!data_utc || typeof data_utc !== "string") {
    return jsonResponse({ error: "Campo 'data_utc' é obrigatório (YYYY-MM-DD)" }, 400);
  }

  // ── Persistência ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from("lead_metrics")
    .insert({
      origem,
      evento,
      periodo: periodo ?? null,
      data_referencia: data_utc,
      leads_iniciados: Number.isFinite(leads_iniciados) ? Number(leads_iniciados) : 0,
      leads_finalizados: Number.isFinite(leads_finalizados) ? Number(leads_finalizados) : 0,
      taxa_conclusao: Number.isFinite(taxa_conclusao) ? Number(taxa_conclusao) : null,
      enviado_em: enviado_em ?? null,
      raw_payload: payload,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[lead-metrics-webhook] Erro ao inserir:", error);
    return jsonResponse({ error: "Erro ao gravar métrica", details: error.message }, 500);
  }

  console.log("[lead-metrics-webhook] OK:", data.id);
  return jsonResponse({ ok: true, id: data.id }, 200);
});
