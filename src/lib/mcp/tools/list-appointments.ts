import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { addDays, cap, fail, NOT_AUTHENTICATED, ok, todayBRT } from "../util";

export default defineTool({
  name: "list_appointments",
  title: "Listar reuniões agendadas",
  description:
    "Lista reuniões do painel (agendamentos) por período e/ou status, já com nome do closer e do SDR responsável. Respeita a permissão do usuário autenticado (RLS).",
  inputSchema: {
    from_date: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: hoje."),
    to_date: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: 30 dias após from_date."),
    status: z
      .enum(["pendente", "confirmada", "agendada", "nao_confirmada", "em_call", "realizada", "cancelada", "no_show"])
      .optional()
      .describe("Filtrar por status."),
    closer_name: z.string().optional().describe("Filtrar por nome do closer (match parcial)."),
    sdr_name: z.string().optional().describe("Filtrar por nome do SDR responsável (match parcial)."),
    limit: z.number().int().optional().describe("Máximo de resultados (padrão 100, teto 500)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, status, closer_name, sdr_name, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const from = from_date ?? todayBRT();
    const to = to_date ?? addDays(from, 30);
    const max = cap(limit);

    let q = sb
      .from("agendamentos")
      .select(
        "id, lead_name, lead_phone, scheduled_date, scheduled_time, duration_minutes, status, closer_id, sdr_responsavel_id, created_by, meet_link, observation, channel_type, meeting_reason, cancellation_reason, created_at, closers(name, email)",
      )
      .is("deleted_at", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(max);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return fail(error.message);
    const rows = data ?? [];

    const { data: profiles } = await sb.from("profiles").select("user_id, full_name");
    const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

    let items = rows.map((r) => {
      const { closers, ...rest } = r as typeof r & { closers?: { name: string; email: string | null } | null };
      return {
        ...rest,
        closer_name: closers?.name ?? null,
        closer_email: closers?.email ?? null,
        sdr_name: nameById.get(r.sdr_responsavel_id ?? "") ?? nameById.get(r.created_by ?? "") ?? null,
      };
    });

    if (closer_name) {
      const needle = closer_name.toLowerCase();
      items = items.filter((i) => (i.closer_name ?? "").toLowerCase().includes(needle));
    }
    if (sdr_name) {
      const needle = sdr_name.toLowerCase();
      items = items.filter((i) => (i.sdr_name ?? "").toLowerCase().includes(needle));
    }

    return ok({ periodo: { from, to }, count: items.length, items });
  },
});
