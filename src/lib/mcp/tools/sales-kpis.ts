import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, NOT_AUTHENTICATED, ok, resolvePeriod } from "../util";

export default defineTool({
  name: "sales_kpis",
  title: "KPIs de vendas do período",
  description:
    "Números consolidados do período (mesma fonte da página Vendas): vendas de 1ª call e de follow-up, vendas avulsas, valor coletado e faturado, não fechou, reuniões realizadas e taxa de conversão.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: início do mês corrente."),
    to: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: hoje."),
    closer_id: z.string().optional().describe("Restringir a um closer (uuid)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, closer_id }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const periodo = resolvePeriod(from, to);

    const [kpis, conv] = await Promise.all([
      sb.rpc("dashboard_vendas_kpis", { p_from: periodo.from, p_to: periodo.to, p_closer_id: closer_id ?? null }),
      sb.rpc("dashboard_conversao_period", { p_from: periodo.from, p_to: periodo.to, p_closer_id: closer_id ?? null }),
    ]);
    if (kpis.error) return fail(kpis.error.message);
    if (conv.error) return fail(conv.error.message);

    const k = (Array.isArray(kpis.data) ? kpis.data[0] : kpis.data) as Record<string, number> | undefined;
    const c = (Array.isArray(conv.data) ? conv.data[0] : conv.data) as
      | { total_reunioes: number; total_vendas: number }
      | undefined;

    const vendasCalls = Number(k?.vendas_calls ?? 0);
    const vendasAvulsas = Number(k?.vendas_avulsas ?? 0);
    const coletado = Number(k?.coletado_calls ?? 0) + Number(k?.coletado_avulsa ?? 0);
    const totalReunioes = Number(c?.total_reunioes ?? 0);
    const totalVendasConv = Number(c?.total_vendas ?? 0);

    return ok({
      periodo,
      vendas: {
        total: vendasCalls + vendasAvulsas,
        de_call: vendasCalls,
        avulsas: vendasAvulsas,
        primeira_call: Number(k?.vendas_primeira_call ?? 0),
        follow_up: Number(k?.vendas_follow ?? 0),
        nao_fechou: Number(k?.nao_fechou ?? 0),
        sem_status_realizada: Number(k?.vendas_sem_status_realizada ?? 0),
      },
      financeiro: {
        coletado,
        coletado_calls: Number(k?.coletado_calls ?? 0),
        coletado_avulsa: Number(k?.coletado_avulsa ?? 0),
        faturado: Number(k?.faturado_calls ?? 0) + Number(k?.faturado_avulsa ?? 0),
        ticket_medio:
          vendasCalls + vendasAvulsas > 0 ? Number((coletado / (vendasCalls + vendasAvulsas)).toFixed(2)) : 0,
      },
      conversao: {
        reunioes_consideradas: totalReunioes,
        vendas_consideradas: totalVendasConv,
        taxa_percentual: totalReunioes ? Number(((totalVendasConv / totalReunioes) * 100).toFixed(1)) : 0,
        observacao: "Conversão sobre 1ªs calls (exclui 2ªs reuniões); vendas atribuídas à data da 1ª call.",
      },
    });
  },
});
