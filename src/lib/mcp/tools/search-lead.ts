import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { cap, fail, NOT_AUTHENTICATED, ok } from "../util";

export default defineTool({
  name: "search_lead",
  title: "Buscar lead",
  description:
    "Busca um lead por nome ou telefone e devolve o histórico dele no painel: todas as reuniões (com closer, status e motivo) e o resultado de venda de cada uma.",
  inputSchema: {
    query: z.string().describe("Nome ou telefone (parcial) do lead."),
    limit: z.number().int().optional().describe("Máximo de reuniões retornadas (padrão 50, teto 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const max = cap(limit, 50, 200);
    const needle = query.trim();
    if (!needle) return fail("Informe um nome ou telefone para buscar.");
    const digits = needle.replace(/\D/g, "");

    const filters = [`lead_name.ilike.%${needle}%`];
    if (digits.length >= 4) filters.push(`lead_phone.ilike.%${digits}%`);

    const { data, error } = await sb
      .from("agendamentos")
      .select(
        "id, lead_name, lead_phone, lead_email, meta_lead_id, scheduled_date, scheduled_time, status, cancellation_reason, meeting_reason, channel_type, observation, sdr_responsavel_id, created_by, created_at, closers(name, email)",
      )
      .is("deleted_at", null)
      .or(filters.join(","))
      .order("scheduled_date", { ascending: false })
      .limit(max);
    if (error) return fail(error.message);

    const rows = data ?? [];
    if (!rows.length) return ok({ query: needle, count: 0, reunioes: [] });

    const [{ data: vendas }, { data: profiles }] = await Promise.all([
      sb
        .from("vendas")
        .select(
          "agendamento_id, vendeu, valor, valor_total_projeto, venda_origem, produto, closed_at, motivo_nao_fechamento, follow_up, follow_up_date, observacoes",
        )
        .in(
          "agendamento_id",
          rows.map((r) => r.id),
        ),
      sb.from("profiles").select("user_id, full_name"),
    ]);

    const vendaPorAgendamento = new Map((vendas ?? []).map((v) => [v.agendamento_id, v]));
    const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

    const reunioes = rows.map((r) => {
      const { closers, ...rest } = r as typeof r & { closers?: { name: string; email: string | null } | null };
      return {
        ...rest,
        closer_name: closers?.name ?? null,
        sdr_name: nameById.get(r.sdr_responsavel_id ?? "") ?? nameById.get(r.created_by ?? "") ?? null,
        venda: vendaPorAgendamento.get(r.id) ?? null,
      };
    });

    return ok({
      query: needle,
      count: reunioes.length,
      total_vendas: reunioes.filter((r) => r.venda?.vendeu).length,
      reunioes,
    });
  },
});
