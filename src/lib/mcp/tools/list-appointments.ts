import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_appointments",
  title: "Listar reuniões agendadas",
  description:
    "Lista reuniões agendadas do painel (agendamentos) filtradas por data e/ou status. Respeita a permissão do usuário autenticado (RLS).",
  inputSchema: {
    from_date: z
      .string()
      .optional()
      .describe("Data inicial (YYYY-MM-DD). Padrão: hoje."),
    to_date: z
      .string()
      .optional()
      .describe("Data final (YYYY-MM-DD, inclusiva). Padrão: 30 dias após from_date."),
    status: z
      .enum(["agendada", "realizada", "cancelada", "no_show"])
      .optional()
      .describe("Filtrar por status."),
    limit: z.number().int().optional().describe("Máximo de resultados (padrão 100, teto 500)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const from = from_date ?? iso(today);
    const to =
      to_date ??
      (() => {
        const d = new Date(from);
        d.setDate(d.getDate() + 30);
        return iso(d);
      })();
    const cap = Math.min(Math.max(limit ?? 100, 1), 500);

    let q = sb(ctx)
      .from("agendamentos")
      .select(
        "id, lead_name, lead_phone, scheduled_date, scheduled_time, duration_minutes, status, closer_id, sdr_responsavel_id, meet_link, briefing, observation, channel_type, meeting_reason, created_at",
      )
      .is("deleted_at", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(cap);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify({ count: data?.length ?? 0, items: data ?? [] }) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
