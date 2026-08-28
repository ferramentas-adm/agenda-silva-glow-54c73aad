import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, NOT_AUTHENTICATED, ok, resolvePeriod } from "../util";

export default defineTool({
  name: "no_show_reasons",
  title: "Motivos de não comparecimento",
  description:
    "Agrupa os motivos de não comparecimento (reuniões marcadas como não compareceu) no período, com contagem e percentual, opcionalmente filtrando por SDR.",
  inputSchema: {
    from: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: início do mês corrente."),
    to: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: hoje."),
    sdr_name: z.string().optional().describe("Filtrar por nome do SDR responsável (match parcial)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, sdr_name }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const periodo = resolvePeriod(from, to);

    const [{ data, error }, { data: profiles }] = await Promise.all([
      sb
        .from("agendamentos")
        .select("id, scheduled_date, cancellation_reason, status, sdr_responsavel_id, created_by, closers(name)")
        .is("deleted_at", null)
        .in("status", ["no_show", "cancelada"])
        .gte("scheduled_date", periodo.from)
        .lte("scheduled_date", periodo.to)
        .limit(5000),
      sb.from("profiles").select("user_id, full_name"),
    ]);
    if (error) return fail(error.message);

    const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
    let rows = (data ?? []).map((r) => ({
      motivo: r.cancellation_reason?.trim() || "(sem motivo informado)",
      sdr_name: nameById.get(r.sdr_responsavel_id ?? "") ?? nameById.get(r.created_by ?? "") ?? null,
      data: r.scheduled_date,
      status: r.status,
    }));

    if (sdr_name) {
      const needle = sdr_name.toLowerCase();
      rows = rows.filter((r) => (r.sdr_name ?? "").toLowerCase().includes(needle));
    }

    const total = rows.length;
    const grouped = new Map<string, number>();
    for (const r of rows) grouped.set(r.motivo, (grouped.get(r.motivo) ?? 0) + 1);

    const items = [...grouped.entries()]
      .map(([motivo, qtd]) => ({
        motivo,
        qtd,
        percentual: total ? Number(((qtd / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.qtd - a.qtd);

    return ok({ periodo, total_nao_compareceu: total, sdr: sdr_name ?? "todos", items });
  },
});
