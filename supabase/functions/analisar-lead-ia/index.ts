import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

async function buscarDataCrazyLead(phone: string) {
  try {
    const apiUrl = Deno.env.get("DATACRAZY_API_URL");
    const token = Deno.env.get("DATACRAZY_API_TOKEN");
    if (!apiUrl || !token || !phone) return null;
    const base = apiUrl.replace(/\/+$/, "");
    const url = `${base}/leads?search=${encodeURIComponent(phone)}&per_page=5`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!r.ok) return null;
    const json = await r.json().catch(() => null);
    const list = json?.data ?? json?.leads ?? [];
    if (!Array.isArray(list) || list.length === 0) return null;
    // Encontra match exato pelo telefone
    const norm = onlyDigits(phone);
    const match = list.find((l: any) => {
      const phones = [l.phone, l.whatsapp, l.celular, ...(l.phones ?? []).map((p: any) => p.phone ?? p)].filter(Boolean);
      return phones.some((p: any) => onlyDigits(String(p)).endsWith(norm.slice(-10)));
    }) ?? list[0];
    return {
      nome: match?.name ?? match?.full_name ?? null,
      faturamento: match?.revenue ?? match?.faturamento ?? match?.custom_fields?.faturamento ?? null,
      segmento: match?.segment ?? match?.segmento ?? match?.custom_fields?.segmento ?? null,
      origem: match?.origin ?? match?.source ?? match?.origem ?? null,
      tags: (match?.tags ?? []).map((t: any) => t?.name ?? t).filter(Boolean),
      observacoes: match?.observations ?? match?.notes ?? match?.observacao ?? null,
    };
  } catch (e) {
    console.warn("DataCrazy lookup falhou:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agendamento_id } = await req.json();
    if (!agendamento_id) {
      return new Response(JSON.stringify({ error: "agendamento_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Agendamento
    const { data: ag, error: agErr } = await supabase
      .from("agendamentos")
      .select("id, lead_name, lead_phone, briefing, observation, channel_type, meeting_reason, scheduled_date, scheduled_time")
      .eq("id", agendamento_id)
      .maybeSingle();
    if (agErr || !ag) throw new Error(agErr?.message ?? "Agendamento não encontrado");

    const phoneDigits = onlyDigits(ag.lead_phone);

    // 2. DataCrazy
    const dcLead = await buscarDataCrazyLead(ag.lead_phone ?? "");

    // 3. Histórico do lead (mesmo telefone)
    let historicoLead: any[] = [];
    if (phoneDigits) {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, status, scheduled_date, meeting_reason, lead_phone")
        .neq("id", ag.id)
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: false })
        .limit(50);
      historicoLead = (data ?? []).filter((a: any) => onlyDigits(a.lead_phone).slice(-10) === phoneDigits.slice(-10));
    }

    // 4. Closers ativos (sem Amanda Padilha)
    const { data: closers = [] } = await supabase
      .from("closers")
      .select("id, name")
      .eq("active", true)
      .not("name", "ilike", "%amanda padilha%");

    // 5. Stats por Closer (últimos 90 dias)
    const since = new Date(); since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: vendasRecentes = [] } = await supabase
      .from("vendas")
      .select("vendeu, valor, lead_revenue, agendamento_id, created_at, agendamentos!inner(closer_id, scheduled_date, status)")
      .gte("created_at", since.toISOString())
      .limit(500);

    const statsCloser = (closers ?? []).map((c: any) => {
      const vendas = (vendasRecentes as any[]).filter((v) => v.agendamentos?.closer_id === c.id);
      const total = vendas.length;
      const fechadas = vendas.filter((v) => v.vendeu).length;
      const ticketMedio = fechadas > 0
        ? vendas.filter((v) => v.vendeu).reduce((s, v) => s + (Number(v.valor) || 0), 0) / fechadas
        : 0;
      const perfilFat = vendas.filter((v) => v.vendeu && v.lead_revenue).reduce((acc: Record<string, number>, v) => {
        acc[v.lead_revenue] = (acc[v.lead_revenue] ?? 0) + 1; return acc;
      }, {});
      return {
        id: c.id, nome: c.name,
        reunioes_90d: total, vendas_90d: fechadas,
        taxa_conversao: total > 0 ? Math.round((fechadas / total) * 100) : null,
        ticket_medio: Math.round(ticketMedio),
        perfil_faturamento_que_fecha: perfilFat,
      };
    });

    // 6. Carga no dia/horário
    const { data: cargaDia = [] } = await supabase
      .from("agendamentos")
      .select("closer_id, scheduled_time")
      .eq("scheduled_date", ag.scheduled_date)
      .is("deleted_at", null)
      .neq("status", "cancelada");

    const cargaPorCloser: Record<string, { dia: number; mesmo_horario: number }> = {};
    for (const c of closers ?? []) cargaPorCloser[c.id] = { dia: 0, mesmo_horario: 0 };
    for (const r of cargaDia as any[]) {
      if (!r.closer_id || !cargaPorCloser[r.closer_id]) continue;
      cargaPorCloser[r.closer_id].dia += 1;
      if (r.scheduled_time === ag.scheduled_time) cargaPorCloser[r.closer_id].mesmo_horario += 1;
    }

    // 7. Prompt Lovable AI
    const sistema = `Você é um analista comercial. Avalie a qualidade de um lead e sugira o melhor Closer para atendê-lo, usando dados de CRM, histórico interno e estatísticas de cada Closer. Responda em pt-BR, objetivo. NUNCA sugira closer com 2+ reuniões no mesmo horário (regra dura).`;

    const contexto = {
      lead: {
        nome: ag.lead_name,
        telefone: ag.lead_phone,
        briefing: ag.briefing,
        observacao: ag.observation,
        canal: ag.channel_type,
        motivo_reuniao: ag.meeting_reason,
        agendado_para: `${ag.scheduled_date} ${ag.scheduled_time}`,
      },
      datacrazy: dcLead,
      historico_lead: historicoLead.map((h) => ({ status: h.status, data: h.scheduled_date, motivo: h.meeting_reason })),
      closers: statsCloser.map((s) => ({
        ...s,
        carga_dia: cargaPorCloser[s.id]?.dia ?? 0,
        reunioes_mesmo_horario: cargaPorCloser[s.id]?.mesmo_horario ?? 0,
        bloqueado_por_horario: (cargaPorCloser[s.id]?.mesmo_horario ?? 0) >= 2,
      })),
    };

    const tools = [{
      type: "function",
      function: {
        name: "responder_analise",
        description: "Devolve a análise estruturada do lead",
        parameters: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            qualidade: { type: "string", enum: ["alta", "media", "baixa"] },
            justificativa: { type: "string" },
            pontos_fortes: { type: "array", items: { type: "string" } },
            pontos_atencao: { type: "array", items: { type: "string" } },
            closer_sugerido: {
              type: ["object", "null"],
              properties: {
                id: { type: "string" },
                nome: { type: "string" },
                motivo: { type: "string" },
              },
              required: ["id", "nome", "motivo"],
            },
          },
          required: ["score", "qualidade", "justificativa", "pontos_fortes", "pontos_atencao", "closer_sugerido"],
          additionalProperties: false,
        },
      },
    }];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: "Dados:\n" + JSON.stringify(contexto, null, 2) + "\n\nChame responder_analise com sua análise." },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "responder_analise" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em alguns segundos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI error ${aiRes.status}: ${txt}`);
    }

    const aiJson = await aiRes.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    const parsed = typeof args === "string" ? JSON.parse(args) : args;

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analisar-lead-ia error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
