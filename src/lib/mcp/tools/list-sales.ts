import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { addDays, cap, fail, NOT_AUTHENTICATED, ok, resolvePeriod } from "../util";

const SELECT =
  "id, agendamento_id, vendeu, valor, valor_total_projeto, order_bumps, venda_origem, produto, closed_at, motivo_nao_fechamento, explicacao_nao_fechamento, observacoes, lead_revenue, created_at, agendamentos!inner(id, lead_name, lead_phone, scheduled_date, scheduled_time, status, channel_type, deleted_at, closers(name, email))";

export default defineTool({
  name: "list_sales",
  title: "Listar vendas",
  description:
    "Lista as vendas (e opcionalmente as não fechadas) do período, com closer, lead, valor, order bumps e origem (1ª call ou follow-up). A venda é atribuída à data de fechamento quando informada, senão à data de registro.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: início do mês corrente."),
    to: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: hoje."),
    closer_name: z.string().optional().describe("Filtrar por nome do closer (match parcial)."),
    incluir_nao_fechadas: z
      .boolean()
      .optional()
      .describe("Se true, inclui também as reuniões que não fecharam venda. Padrão: só vendas fechadas."),
    limit: z.number().int().optional().describe("Máximo de itens (padrão 200, teto 500)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, closer_name, incluir_nao_fechadas, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const periodo = resolvePeriod(from, to);
    const max = cap(limit, 200);
    // Limites em UTC equivalentes ao dia em America/Sao_Paulo (UTC-3).
    const startTs = `${periodo.from}T03:00:00Z`;
    const endTs = `${addDays(periodo.to, 1)}T03:00:00Z`;

    const base = () => {
      let q = sb.from("vendas").select(SELECT).limit(max);
      if (!incluir_nao_fechadas) q = q.eq("vendeu", true);
      return q;
    };

    const [porFechamento, porRegistro] = await Promise.all([
      base().gte("closed_at", periodo.from).lte("closed_at", periodo.to),
      base().is("closed_at", null).gte("created_at", startTs).lt("created_at", endTs),
    ]);
    if (porFechamento.error) return fail(porFechamento.error.message);
    if (porRegistro.error) return fail(porRegistro.error.message);

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of [...(porFechamento.data ?? []), ...(porRegistro.data ?? [])]) {
      byId.set((row as { id: string }).id, row as Record<string, unknown>);
    }

    let items = [...byId.values()]
      .map((row) => {
        const ag = row.agendamentos as {
          lead_name: string;
          lead_phone: string;
          scheduled_date: string;
          scheduled_time: string;
          status: string;
          channel_type: string | null;
          deleted_at: string | null;
          closers?: { name: string; email: string | null } | null;
        };
        const bumps = Array.isArray(row.order_bumps) ? (row.order_bumps as unknown[]) : [];
        return {
          venda_id: row.id,
          agendamento_id: row.agendamento_id,
          vendeu: row.vendeu,
          valor: row.valor,
          valor_total_projeto: row.valor_total_projeto,
          order_bumps: bumps,
          venda_origem: row.venda_origem ?? null,
          produto: row.produto ?? null,
          data_atribuicao: row.closed_at ?? String(row.created_at).slice(0, 10),
          closed_at: row.closed_at ?? null,
          registrada_em: row.created_at,
          motivo_nao_fechamento: row.motivo_nao_fechamento ?? null,
          explicacao_nao_fechamento: row.explicacao_nao_fechamento ?? null,
          observacoes: row.observacoes ?? null,
          faturamento_lead: row.lead_revenue ?? null,
          lead_name: ag.lead_name,
          lead_phone: ag.lead_phone,
          reuniao_data: ag.scheduled_date,
          reuniao_hora: ag.scheduled_time,
          reuniao_status: ag.status,
          canal: ag.channel_type ?? null,
          closer_name: ag.closers?.name ?? null,
          _deleted: !!ag.deleted_at,
        };
      })
      .filter((i) => !i._deleted)
      .sort((a, b) => String(a.data_atribuicao).localeCompare(String(b.data_atribuicao)));

    if (closer_name) {
      const needle = closer_name.toLowerCase();
      items = items.filter((i) => (i.closer_name ?? "").toLowerCase().includes(needle));
    }

    const fechadas = items.filter((i) => i.vendeu);
    const total = fechadas.reduce((s, i) => s + Number(i.valor ?? 0), 0);

    return ok({
      periodo,
      count: items.length,
      resumo: {
        vendas: fechadas.length,
        coletado: total,
        ticket_medio: fechadas.length ? Number((total / fechadas.length).toFixed(2)) : 0,
      },
      items: items.map(({ _deleted, ...rest }) => rest),
    });
  },
});
