// Edge function pública para receber métricas/leads de projetos externos.
// Validação por header Authorization: Bearer <EXTERNAL_WEBHOOK_TOKEN>
//
// Aceita DOIS formatos de payload (retrocompatível):
//
// 1) Payload AGREGADO (legado):
// {
//   "origem": "formulario_bio", "evento": "atualizacao_manual",
//   "data_utc": "2026-04-25", "leads_iniciados": 433, "leads_finalizados": 71, ...
// }
//
// 2) Payload POR LEAD (novo):
// {
//   "origem": "formulario_bio", "evento": "lead_qualificado",
//   "data_utc": "2026-04-28", "enviado_em": "...",
//   "lead": {
//     "nome": "...", "email": "...", "telefone": "...",
//     "tem_empresa": true|false,
//     "faturamento": "Entre R$50.000 e R$70.000 por mês" | null,
//     "renda": "Entre R$20.000 e R$50.000 por mês" | null
//   }
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface LeadInfo {
  nome?: string;
  email?: string;
  telefone?: string;
  tem_empresa?: boolean;
  faturamento?: string | null;
  renda?: string | null;
}

interface LeadMetricsPayload {
  origem?: string;
  evento?: string;
  periodo?: string;
  data_utc?: string;
  enviado_em?: string;
  // agregado
  leads_iniciados?: number;
  leads_finalizados?: number;
  taxa_conclusao?: number;
  // por lead
  lead?: LeadInfo;
  [key: string]: unknown;
}

// ── Faixas de classificação ──
const FATURAMENTO_QUALIFICADO = new Set([
  "Entre R$30.000 e R$50.000 por mês",
  "Entre R$50.000 e R$70.000 por mês",
  "Entre R$70.000 e R$100.000 por mês",
  "Entre R$100.000 e R$500.000 por mês",
  "Entre R$500.000 e R$1.000.000 por mês",
  "Acima de R$1.000.000 por mês",
]);
const FATURAMENTO_DESQUALIFICADO = new Set([
  "Abaixo de R$30.000 por mês",
]);
const RENDA_QUALIFICADA = new Set([
  "Entre R$20.000 e R$50.000 por mês",
  "Acima de R$50.000 por mês",
]);
const RENDA_DESQUALIFICADA = new Set([
  "Abaixo de R$5.000 por mês",
  "Entre R$5.000 e R$10.000 por mês",
  "Entre R$10.000 e R$20.000 por mês",
]);

function classify(faturamento?: string | null, renda?: string | null):
  "qualificado_faturamento" | "qualificado_renda" | "desqualificado" | null {
  const f = (faturamento ?? "").trim();
  const r = (renda ?? "").trim();
  if (f && FATURAMENTO_QUALIFICADO.has(f)) return "qualificado_faturamento";
  if (r && RENDA_QUALIFICADA.has(r)) return "qualificado_renda";
  if (f && FATURAMENTO_DESQUALIFICADO.has(f)) return "desqualificado";
  if (r && RENDA_DESQUALIFICADA.has(r)) return "desqualificado";
  return null;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

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
    origem, evento, periodo, data_utc, enviado_em,
    leads_iniciados, leads_finalizados, taxa_conclusao, lead,
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

  // ── Detecta tipo do payload ──
  const isPerLead = lead && typeof lead === "object";

  // ── Persistência ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const baseRow: Record<string, unknown> = {
    origem,
    evento,
    periodo: periodo ?? null,
    data_referencia: data_utc,
    enviado_em: enviado_em ?? null,
    raw_payload: payload,
  };

  if (isPerLead) {
    const faturamento = lead!.faturamento ?? null;
    const renda = lead!.renda ?? null;
    const classificacao = classify(faturamento, renda);

    Object.assign(baseRow, {
      leads_iniciados: 0,
      leads_finalizados: 1,
      taxa_conclusao: null,
      lead_nome: lead!.nome ?? null,
      lead_email: lead!.email ?? null,
      lead_telefone: lead!.telefone ?? null,
      tem_empresa: typeof lead!.tem_empresa === "boolean" ? lead!.tem_empresa : null,
      faturamento,
      renda,
      classificacao,
    });
  } else {
    Object.assign(baseRow, {
      leads_iniciados: Number.isFinite(leads_iniciados) ? Number(leads_iniciados) : 0,
      leads_finalizados: Number.isFinite(leads_finalizados) ? Number(leads_finalizados) : 0,
      taxa_conclusao: Number.isFinite(taxa_conclusao) ? Number(taxa_conclusao) : null,
    });
  }

  const { data, error } = await supabase
    .from("lead_metrics")
    .insert(baseRow)
    .select("id")
    .single();

  if (error) {
    console.error("[lead-metrics-webhook] Erro ao inserir:", error);
    return jsonResponse({ error: "Erro ao gravar métrica", details: error.message }, 500);
  }

  console.log("[lead-metrics-webhook] OK:", data.id, isPerLead ? "(per-lead)" : "(aggregate)");
  return jsonResponse({ ok: true, id: data.id, mode: isPerLead ? "per_lead" : "aggregate" }, 200);
});
