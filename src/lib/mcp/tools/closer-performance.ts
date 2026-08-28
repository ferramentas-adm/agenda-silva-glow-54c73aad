import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, NOT_AUTHENTICATED, ok, resolvePeriod } from "../util";

export default defineTool({
  name: "closer_performance",
  title: "Performance por closer",
  description:
    "Ranking por closer no período: reuniões realizadas, vendas, receita e taxa de conversão (inclui closers com zero venda). Mesma fonte da página Vendas.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: início do mês corrente."),
    to: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: hoje."),
    canal: z.string().optional().describe("Filtrar por canal (channel_type), ex.: inbound."),
    ordenar_por: z.enum(["conversao", "vendas", "receita", "realizadas"]).optional().describe("Padrão: conversao."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, canal, ordenar_por }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const periodo = resolvePeriod(from, to);

    const [perf, closers, semCloser] = await Promise.all([
      sb.rpc("dashboard_vendas_closer_perf", {
        p_from: periodo.from,
        p_to: periodo.to,
        p_channel: canal ?? null,
        p_closer_id: null,
      }),
      sb.from("closers").select("id, name, active"),
      sb.rpc("dashboard_vendas_realizadas_sem_closer", { p_from: periodo.from, p_to: periodo.to }),
    ]);
    if (perf.error) return fail(perf.error.message);

    const nameById = new Map((closers.data ?? []).map((c) => [c.id, c.name]));
    const rows = (perf.data ?? []) as Array<{
      closer_id: string;
      realizadas: number;
      vendas: number;
      receita: number;
    }>;

    const items = rows.map((r) => ({
      closer_id: r.closer_id,
      closer_name: nameById.get(r.closer_id) ?? "(closer removido)",
      realizadas: Number(r.realizadas ?? 0),
      vendas: Number(r.vendas ?? 0),
      receita: Number(r.receita ?? 0),
      conversao_percentual: Number(r.realizadas) ? Number(((Number(r.vendas) / Number(r.realizadas)) * 100).toFixed(1)) : 0,
    }));

    const key = ordenar_por ?? "conversao";
    items.sort((a, b) =>
      key === "vendas"
        ? b.vendas - a.vendas
        : key === "receita"
          ? b.receita - a.receita
          : key === "realizadas"
            ? b.realizadas - a.realizadas
            : b.conversao_percentual - a.conversao_percentual,
    );

    return ok({
      periodo,
      canal: canal ?? "todos",
      count: items.length,
      realizadas_sem_closer_atribuido: Number(semCloser.data ?? 0),
      items,
    });
  },
});
