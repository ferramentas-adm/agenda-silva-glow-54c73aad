import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, NOT_AUTHENTICATED, ok } from "../util";

export default defineTool({
  name: "get_appointment",
  title: "Detalhes da reunião",
  description: "Retorna os detalhes completos de uma reunião pelo id, incluindo closer, SDR e resultado da venda.",
  inputSchema: {
    id: z.string().describe("ID (uuid) da reunião."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("agendamentos")
      .select("*, closers(name, email)")
      .eq("id", id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Reunião não encontrada.");

    const [{ data: venda }, { data: profiles }] = await Promise.all([
      sb
        .from("vendas")
        .select(
          "id, vendeu, valor, valor_total_projeto, order_bumps, venda_origem, produto, closed_at, follow_up, follow_up_date, follow_up_time, motivo_nao_fechamento, explicacao_nao_fechamento, observacoes, lead_revenue, created_at",
        )
        .eq("agendamento_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from("profiles").select("user_id, full_name"),
    ]);

    const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
    const row = data as Record<string, unknown> & { closers?: { name: string; email: string | null } | null };

    return ok({
      appointment: {
        ...row,
        closer_name: row.closers?.name ?? null,
        sdr_name:
          nameById.get(String(row.sdr_responsavel_id ?? "")) ?? nameById.get(String(row.created_by ?? "")) ?? null,
      },
      venda: venda ?? null,
    });
  },
});
