import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { addDays, fail, NOT_AUTHENTICATED, ok, resolvePeriod } from "../util";

export default defineTool({
  name: "sdr_productivity",
  title: "Produtividade dos SDRs",
  description:
    "Agendamentos criados por SDR no período (pela data de criação), com quantas foram realizadas, quantas não compareceram, taxa de comparecimento e vendas geradas.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: início do mês corrente."),
    to: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: hoje."),
    base: z
      .enum(["criacao", "reuniao"])
      .optional()
      .describe("Contar pela data de criação do agendamento (padrão) ou pela data da reunião."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, base }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const periodo = resolvePeriod(from, to);
    const porCriacao = (base ?? "criacao") === "criacao";

    let q = sb
      .from("agendamentos")
      .select("id, status, sdr_responsavel_id, created_by, scheduled_date, created_at")
      .is("deleted_at", null)
      .limit(5000);
    if (porCriacao) {
      q = q.gte("created_at", `${periodo.from}T03:00:00Z`).lt("created_at", `${addDays(periodo.to, 1)}T03:00:00Z`);
    } else {
      q = q.gte("scheduled_date", periodo.from).lte("scheduled_date", periodo.to);
    }

    const [{ data, error }, { data: profiles }] = await Promise.all([
      q,
      sb.from("profiles").select("user_id, full_name"),
    ]);
    if (error) return fail(error.message);

    const rows = data ?? [];
    const ids = rows.map((r) => r.id);
    const vendasPorAgendamento = new Map<string, boolean>();
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      if (!slice.length) break;
      const { data: vendas } = await sb
        .from("vendas")
        .select("agendamento_id, vendeu")
        .in("agendamento_id", slice)
        .eq("vendeu", true);
      for (const v of vendas ?? []) vendasPorAgendamento.set(v.agendamento_id, true);
    }

    const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
    const agg = new Map<
      string,
      { sdr_name: string; criadas: number; realizadas: number; nao_compareceu: number; vendas: number }
    >();

    for (const r of rows) {
      const key = r.sdr_responsavel_id ?? r.created_by ?? "sem_sdr";
      const entry =
        agg.get(key) ??
        {
          sdr_name: nameById.get(key) ?? "(sem SDR atribuído)",
          criadas: 0,
          realizadas: 0,
          nao_compareceu: 0,
          vendas: 0,
        };
      entry.criadas += 1;
      if (r.status === "realizada") entry.realizadas += 1;
      if (r.status === "no_show" || r.status === "cancelada") entry.nao_compareceu += 1;
      if (vendasPorAgendamento.has(r.id)) entry.vendas += 1;
      agg.set(key, entry);
    }

    const items = [...agg.entries()]
      .map(([sdr_id, v]) => ({
        sdr_id,
        ...v,
        taxa_comparecimento_percentual:
          v.realizadas + v.nao_compareceu > 0
            ? Number(((v.realizadas / (v.realizadas + v.nao_compareceu)) * 100).toFixed(1))
            : 0,
        conversao_percentual: v.realizadas ? Number(((v.vendas / v.realizadas) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.criadas - a.criadas);

    return ok({
      periodo,
      base: porCriacao ? "data de criação do agendamento" : "data da reunião",
      total_agendamentos: rows.length,
      items,
    });
  },
});
