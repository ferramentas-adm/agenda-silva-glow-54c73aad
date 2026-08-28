import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, NOT_AUTHENTICATED, ok } from "../util";

export default defineTool({
  name: "list_closers",
  title: "Listar closers",
  description: "Lista os closers cadastrados no painel, com status ativo/inativo e horário comercial.",
  inputSchema: {
    only_active: z.boolean().optional().describe("Se true, retorna somente closers ativos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ only_active }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    let q = supabaseForUser(ctx)
      .from("closers")
      .select("id, name, email, active, business_hours_start, business_hours_end")
      .order("name");
    if (only_active) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ count: data?.length ?? 0, items: data ?? [] });
  },
});
