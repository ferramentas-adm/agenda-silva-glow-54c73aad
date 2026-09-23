import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { cap, fail, NOT_AUTHENTICATED, ok, todayBRT } from "../util";

const SELECT =
  "id, agendamento_id, follow_up, follow_up_date, follow_up_time, motivo_nao_fechamento, explicacao_nao_fechamento, observacoes, valor, valor_total_projeto, lead_revenue, created_at, agendamentos!inner(lead_name, lead_phone, scheduled_date, scheduled_time, status, deleted_at, closers(name, email))";

type Row = Record<string, unknown> & {
  agendamentos: {
    lead_name: string;
    lead_phone: string;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
    deleted_at: string | null;
    closers?: { name: string; email: string | null } | null;
  };
};

function map(row: Row, hoje: string) {
  const ag = row.agendamentos;
  const followDate = (row.follow_up_date as string | null) ?? null;
  return {
    venda_id: row.id,
    agendamento_id: row.agendamento_id,
    lead_name: ag.lead_name,
    lead_phone: ag.lead_phone,
    closer_name: ag.closers?.name ?? null,
    reuniao_data: ag.scheduled_date,
    reuniao_hora: ag.scheduled_time,
    reuniao_status: ag.status,
    follow_up_date: followDate,
    follow_up_time: (row.follow_up_time as string | null) ?? null,
    atrasado: !!followDate && followDate < hoje,
    motivo_nao_fechamento: row.motivo_nao_fechamento ?? null,
    explicacao_nao_fechamento: row.explicacao_nao_fechamento ?? null,
    observacoes: row.observacoes ?? null,
    valor_previsto: row.valor_total_projeto ?? row.valor ?? null,
    faturamento_lead: row.lead_revenue ?? null,
  };
}

export default defineTool({
  name: "list_followups",
  title: "Listar follow-ups",
  description:
    "Follow-ups em acompanhamento (venda não fechada com data de follow-up marcada) e reuniões não fechadas sem follow-up marcado, com motivo, valor previsto e sinalização de atraso.",
  inputSchema: {
    bloco: z
      .enum(["em_acompanhamento", "nao_acompanhados", "todos"])
      .optional()
      .describe("Qual bloco retornar. Padrão: todos."),
    from: z.string().optional().describe("Data inicial do follow-up (YYYY-MM-DD)."),
    to: z.string().optional().describe("Data final do follow-up (YYYY-MM-DD, inclusiva)."),
    closer_name: z.string().optional().describe("Filtrar por nome do closer (match parcial)."),
    apenas_atrasados: z.boolean().optional().describe("Se true, só follow-ups vencidos."),
    limit: z.number().int().optional().describe("Máximo de itens por bloco (padrão 200, teto 500)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ bloco, from, to, closer_name, apenas_atrasados, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const hoje = todayBRT();
    const max = cap(limit, 200);
    const which = bloco ?? "todos";

    const filtrar = (items: ReturnType<typeof map>[]) => {
      let out = [...items];
      if (closer_name) {
        const needle = closer_name.toLowerCase();
        out = out.filter((i) => (i.closer_name ?? "").toLowerCase().includes(needle));
      }
      if (apenas_atrasados) out = out.filter((i) => i.atrasado);
      return out;
    };

    let emAcompanhamento: ReturnType<typeof map>[] = [];
    let naoAcompanhados: ReturnType<typeof map>[] = [];

    if (which !== "nao_acompanhados") {
      let q = sb
        .from("vendas")
        .select(SELECT)
        .eq("vendeu", false)
        .eq("follow_up", true)
        .eq("follow_up_status", "ativo")
        .not("follow_up_date", "is", null)
        .order("follow_up_date", { ascending: true })
        .limit(max);
      if (from) q = q.gte("follow_up_date", from);
      if (to) q = q.lte("follow_up_date", to);
      const { data, error } = await q;
      if (error) return fail(error.message);
      emAcompanhamento = filtrar(
        (data ?? []).filter((r) => !(r as unknown as Row).agendamentos.deleted_at).map((r) => map(r as unknown as Row, hoje)),
      );
    }

    if (which !== "em_acompanhamento") {
      let q = sb
        .from("vendas")
        .select(SELECT)
        .eq("vendeu", false)
        .eq("follow_up", false)
        .order("created_at", { ascending: false })
        .limit(max);
      if (from) q = q.gte("agendamentos.scheduled_date", from);
      if (to) q = q.lte("agendamentos.scheduled_date", to);
      const { data, error } = await q;
      if (error) return fail(error.message);
      naoAcompanhados = filtrar(
        (data ?? []).filter((r) => !(r as unknown as Row).agendamentos.deleted_at).map((r) => map(r as unknown as Row, hoje)),
      );
    }

    const pipeline = emAcompanhamento.reduce((s, i) => s + Number(i.valor_previsto ?? 0), 0);

    return ok({
      hoje,
      resumo: {
        em_acompanhamento: emAcompanhamento.length,
        atrasados: emAcompanhamento.filter((i) => i.atrasado).length,
        de_hoje: emAcompanhamento.filter((i) => i.follow_up_date === hoje).length,
        nao_acompanhados: naoAcompanhados.length,
        valor_em_pipeline: pipeline,
      },
      em_acompanhamento: which === "nao_acompanhados" ? undefined : emAcompanhamento,
      nao_acompanhados: which === "em_acompanhamento" ? undefined : naoAcompanhados,
    });
  },
});
