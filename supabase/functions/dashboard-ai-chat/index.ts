/**
 * Chat de IA do dashboard comercial. Recebe a mensagem do usuário + histórico,
 * dá ao modelo acesso a tools read-only (consultas ao Postgres) e devolve a
 * resposta em texto. Persistência fica no front (tabela ai_chat_messages).
 *
 * Modelo: google/gemini-3-flash-preview via Lovable AI Gateway.
 * Acesso restrito a gestor/moderador.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const MAX_STEPS = 8;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// ── Helpers de período ───────────────────────────────────────────
function brToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function monthBounds(ymd: string): { start: string; end: string } {
  const [y, m] = ymd.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function prevMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── Tools (executadas via service_role no Postgres) ──────────────
type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

async function runRPC(sql: string): Promise<ToolResult> {
  // Não temos rpc genérico; cada tool faz suas queries.
  return { ok: false, error: "use specific tools" };
}

async function tool_overview(args: { start: string; end: string }): Promise<ToolResult> {
  const { data, error } = await admin
    .from("agendamentos")
    .select("id, scheduled_date, status, channel_type, closer_id, original_agendamento_id")
    .is("deleted_at", null)
    .gte("scheduled_date", args.start)
    .lte("scheduled_date", args.end);
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((a) => a.id);
  let vendas: { agendamento_id: string; vendeu: boolean; valor: number | null; motivo_nao_fechamento: string | null; follow_up: boolean }[] = [];
  if (ids.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
    for (const c of chunks) {
      const { data: vs } = await admin
        .from("vendas")
        .select("agendamento_id, vendeu, valor, motivo_nao_fechamento, follow_up")
        .in("agendamento_id", c);
      vendas = vendas.concat((vs ?? []) as typeof vendas);
    }
  }
  const ven = vendas.filter((v) => v.vendeu);
  const totalVenda = ven.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const callInterr = vendas.filter((v) => (v.motivo_nao_fechamento ?? "").toLowerCase().startsWith("call inter")).length;
  const realizadas = (data ?? []).filter((a) => a.status === "realizada").length;
  const baseConv = realizadas - callInterr;
  return {
    ok: true,
    data: {
      periodo: { start: args.start, end: args.end },
      agendamentos: data?.length ?? 0,
      realizadas,
      no_show: (data ?? []).filter((a) => a.status === "no_show").length,
      canceladas: (data ?? []).filter((a) => a.status === "cancelada").length,
      reagendadas: (data ?? []).filter((a) => a.status === "reagendada" || a.original_agendamento_id).length,
      call_interrompida: callInterr,
      vendas: ven.length,
      faturamento: totalVenda,
      ticket_medio: ven.length ? Math.round(totalVenda / ven.length) : 0,
      conversao_pct: baseConv > 0 ? Math.round((ven.length / baseConv) * 1000) / 10 : 0,
      base_conversao: baseConv,
      follow_ups_abertos: vendas.filter((v) => v.follow_up).length,
    },
  };
}

async function tool_by_closer(args: { start: string; end: string }): Promise<ToolResult> {
  const { data: ags, error } = await admin
    .from("agendamentos")
    .select("id, status, closer_id")
    .is("deleted_at", null)
    .gte("scheduled_date", args.start)
    .lte("scheduled_date", args.end);
  if (error) return { ok: false, error: error.message };
  const ids = (ags ?? []).map((a) => a.id);
  let vendas: { agendamento_id: string; vendeu: boolean; valor: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    const { data: vs } = await admin.from("vendas").select("agendamento_id, vendeu, valor").in("agendamento_id", c);
    vendas = vendas.concat((vs ?? []) as typeof vendas);
  }
  const { data: closers } = await admin.from("closers").select("id, name");
  const cMap = new Map((closers ?? []).map((c) => [c.id, c.name]));
  const vMap = new Map<string, { vendeu: boolean; valor: number }>();
  vendas.forEach((v) => vMap.set(v.agendamento_id, { vendeu: v.vendeu, valor: Number(v.valor) || 0 }));
  const acc = new Map<string, { realiz: number; vendas: number; valor: number }>();
  (ags ?? []).forEach((a) => {
    const name = cMap.get(a.closer_id ?? "") ?? "—";
    const cur = acc.get(name) ?? { realiz: 0, vendas: 0, valor: 0 };
    if (a.status === "realizada") cur.realiz += 1;
    const v = vMap.get(a.id);
    if (v?.vendeu) { cur.vendas += 1; cur.valor += v.valor; }
    acc.set(name, cur);
  });
  const rows = Array.from(acc.entries()).map(([closer, v]) => ({
    closer,
    realizadas: v.realiz,
    vendas: v.vendas,
    conv_pct: v.realiz ? Math.round((v.vendas / v.realiz) * 1000) / 10 : 0,
    ticket_medio: v.vendas ? Math.round(v.valor / v.vendas) : 0,
    faturamento: v.valor,
  })).sort((a, b) => b.realizadas - a.realizadas);
  return { ok: true, data: rows };
}

async function tool_motivos(args: { start: string; end: string }): Promise<ToolResult> {
  const { data: ags } = await admin
    .from("agendamentos")
    .select("id")
    .is("deleted_at", null)
    .eq("status", "realizada")
    .gte("scheduled_date", args.start)
    .lte("scheduled_date", args.end);
  const ids = (ags ?? []).map((a) => a.id);
  let vendas: { motivo_nao_fechamento: string | null; vendeu: boolean }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    const { data: vs } = await admin.from("vendas").select("motivo_nao_fechamento, vendeu").in("agendamento_id", c);
    vendas = vendas.concat((vs ?? []) as typeof vendas);
  }
  const acc = new Map<string, number>();
  vendas.filter((v) => !v.vendeu && v.motivo_nao_fechamento).forEach((v) => {
    acc.set(v.motivo_nao_fechamento!, (acc.get(v.motivo_nao_fechamento!) ?? 0) + 1);
  });
  return { ok: true, data: Array.from(acc.entries()).map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd) };
}

async function tool_weekly(args: { start: string; end: string }): Promise<ToolResult> {
  const { data: ags } = await admin
    .from("agendamentos")
    .select("id, scheduled_date, status")
    .is("deleted_at", null)
    .gte("scheduled_date", args.start)
    .lte("scheduled_date", args.end);
  const ids = (ags ?? []).map((a) => a.id);
  let vendas: { agendamento_id: string; vendeu: boolean; valor: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    const { data: vs } = await admin.from("vendas").select("agendamento_id, vendeu, valor").in("agendamento_id", c);
    vendas = vendas.concat((vs ?? []) as typeof vendas);
  }
  const vMap = new Map(vendas.filter((v) => v.vendeu).map((v) => [v.agendamento_id, Number(v.valor) || 0]));
  // Agrupa por semana (segunda como início)
  const acc = new Map<string, { ag: number; realiz: number; vendas: number; valor: number }>();
  (ags ?? []).forEach((a) => {
    const d = new Date(a.scheduled_date + "T12:00:00Z");
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    const wk = d.toISOString().slice(0, 10);
    const cur = acc.get(wk) ?? { ag: 0, realiz: 0, vendas: 0, valor: 0 };
    cur.ag += 1;
    if (a.status === "realizada") cur.realiz += 1;
    if (vMap.has(a.id)) { cur.vendas += 1; cur.valor += vMap.get(a.id)!; }
    acc.set(wk, cur);
  });
  return {
    ok: true,
    data: Array.from(acc.entries()).map(([semana, v]) => ({
      semana, ...v,
      conv_pct: v.realiz ? Math.round((v.vendas / v.realiz) * 1000) / 10 : 0,
      ticket_medio: v.vendas ? Math.round(v.valor / v.vendas) : 0,
    })).sort((a, b) => a.semana.localeCompare(b.semana)),
  };
}

async function tool_offers(args: { start: string; end: string }): Promise<ToolResult> {
  const { data: ags } = await admin
    .from("agendamentos")
    .select("id, closer_id")
    .is("deleted_at", null)
    .gte("scheduled_date", args.start)
    .lte("scheduled_date", args.end);
  const ids = (ags ?? []).map((a) => a.id);
  const cMap = new Map((ags ?? []).map((a) => [a.id, a.closer_id]));
  let vendas: { agendamento_id: string; valor: number | null; vendeu: boolean }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    const { data: vs } = await admin.from("vendas").select("agendamento_id, valor, vendeu").in("agendamento_id", c).not("valor", "is", null);
    vendas = vendas.concat((vs ?? []) as typeof vendas);
  }
  const { data: closers } = await admin.from("closers").select("id, name");
  const nameMap = new Map((closers ?? []).map((c) => [c.id, c.name]));
  const acc = new Map<string, { ofertas: number; vendas: number; min: number; max: number; total: number }>();
  vendas.forEach((v) => {
    const name = nameMap.get(cMap.get(v.agendamento_id) ?? "") ?? "—";
    const cur = acc.get(name) ?? { ofertas: 0, vendas: 0, min: Infinity, max: 0, total: 0 };
    cur.ofertas += 1;
    cur.total += Number(v.valor) || 0;
    cur.min = Math.min(cur.min, Number(v.valor) || 0);
    cur.max = Math.max(cur.max, Number(v.valor) || 0);
    if (v.vendeu) cur.vendas += 1;
    acc.set(name, cur);
  });
  return {
    ok: true,
    data: Array.from(acc.entries()).map(([closer, v]) => ({
      closer,
      ofertas: v.ofertas,
      vendas: v.vendas,
      min: v.min === Infinity ? 0 : v.min,
      max: v.max,
      ticket_oferta_medio: v.ofertas ? Math.round(v.total / v.ofertas) : 0,
    })).sort((a, b) => b.ofertas - a.ofertas),
  };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "overview",
      description: "Métricas agregadas do período (agendamentos, realizadas, no-show, vendas, ticket médio, conversão, follow-ups, call interrompida). Use para comparar meses.",
      parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
    },
  },
  {
    type: "function",
    function: {
      name: "by_closer",
      description: "Quebra por closer no período: realizadas, vendas, conversão, ticket médio, faturamento.",
      parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
    },
  },
  {
    type: "function",
    function: {
      name: "motivos_nao_fechamento",
      description: "Ranking dos motivos de não-fechamento entre as reuniões realizadas do período.",
      parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
    },
  },
  {
    type: "function",
    function: {
      name: "weekly_trend",
      description: "Tendência semanal de agendamentos, realizadas, vendas, conversão e ticket médio.",
      parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
    },
  },
  {
    type: "function",
    function: {
      name: "offers_by_closer",
      description: "Valores ofertados (qualquer venda com valor != null, vendeu ou não) por closer no período.",
      parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
    },
  },
];

async function runTool(name: string, args: { start: string; end: string }): Promise<ToolResult> {
  try {
    if (name === "overview") return await tool_overview(args);
    if (name === "by_closer") return await tool_by_closer(args);
    if (name === "motivos_nao_fechamento") return await tool_motivos(args);
    if (name === "weekly_trend") return await tool_weekly(args);
    if (name === "offers_by_closer") return await tool_offers(args);
    return { ok: false, error: `unknown tool: ${name}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Verifica role
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAllowed = (roles ?? []).some((r) => r.role === "gestor" || r.role === "moderador");
    if (!isAllowed) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const history: { role: string; content: string }[] = body.messages ?? [];

    const today = brToday();
    const { start: mStart, end: mEnd } = monthBounds(today);
    const prevYmd = prevMonth(today);
    const { start: pStart } = monthBounds(prevYmd);
    const pEnd = prevYmd; // mesmo dia do mês passado

    const systemPrompt = `Você é um analista de dados sênior do time comercial do Grupo Silva. Responda SEMPRE em português, de forma direta e objetiva. Use tabelas em markdown quando comparar dados.

CONTEXTO:
- Hoje é ${today} (timezone America/Sao_Paulo).
- Mês atual: ${mStart} a ${mEnd}. Mês passado mesmo período: ${pStart} a ${pEnd}.
- Status de agendamento: agendada, confirmada, realizada, no_show, cancelada, reagendada.
- Base de conversão = realizadas - call_interrompida (motivo "Call Inter..." na venda).
- Use as tools para buscar dados antes de afirmar algo numericamente. Não invente números.
- Para perguntas sobre tendências/padrões: comece chamando overview(mes atual) e overview(mesmo período mes anterior), depois aprofunde com by_closer, motivos_nao_fechamento ou weekly_trend conforme necessário.
- Destaque alertas: queda de ticket >15%, queda de conversão >2pp, crescimento de follow-ups >50%, no-show >22%.`;

    const messages: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown }[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto" }),
      });
      if (r.status === 429) return new Response(JSON.stringify({ error: "rate_limit", message: "Muitas requisições — tente novamente em alguns segundos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 402) return new Response(JSON.stringify({ error: "no_credits", message: "Créditos de IA esgotados — adicione créditos no workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!r.ok) {
        const t = await r.text();
        console.error("gateway error", r.status, t);
        return new Response(JSON.stringify({ error: "gateway_error", message: t.slice(0, 500) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const j = await r.json();
      const msg = j.choices?.[0]?.message;
      if (!msg) return new Response(JSON.stringify({ error: "empty_response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return new Response(JSON.stringify({ content: msg.content ?? "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let args: { start: string; end: string };
        try { args = JSON.parse(tc.function.arguments); } catch { args = { start: mStart, end: mEnd }; }
        const result = await runTool(tc.function.name, args);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 50000),
        });
      }
    }

    return new Response(JSON.stringify({ content: "Não consegui finalizar a análise (limite de passos atingido). Refaça a pergunta com mais foco." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "internal", message: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
