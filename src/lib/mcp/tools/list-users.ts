import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, NOT_AUTHENTICATED, ok } from "../util";

export default defineTool({
  name: "list_users",
  title: "Listar usuários do painel",
  description:
    "Lista os usuários do painel com função (gestor, moderador, supervisor, SDR, closer, apresentador), e-mail e status ativo/inativo. Disponível apenas para gestor e moderador.",
  inputSchema: {
    role: z
      .enum(["gestor", "moderador", "supervisor", "apresentador", "sdr", "closer"])
      .optional()
      .describe("Filtrar por função."),
    only_active: z.boolean().optional().describe("Se true, retorna somente usuários ativos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ role, only_active }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: myRole } = await sb.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (!myRole || !["gestor", "moderador"].includes(myRole.role)) {
      return fail("Acesso negado: somente gestor ou moderador pode listar usuários do painel.");
    }

    const [{ data: profiles, error }, { data: roles }] = await Promise.all([
      sb.from("profiles").select("user_id, full_name, email, active, sdr_team, is_sdr_override").order("full_name"),
      sb.from("user_roles").select("user_id, role"),
    ]);
    if (error) return fail(error.message);

    const roleById = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    let items = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      nome: p.full_name,
      email: p.email,
      funcao: roleById.get(p.user_id) ?? null,
      ativo: p.active,
      time_sdr: p.sdr_team ?? null,
      atua_como_sdr: p.is_sdr_override,
    }));

    if (role) items = items.filter((i) => i.funcao === role);
    if (only_active) items = items.filter((i) => i.ativo);

    return ok({ count: items.length, items });
  },
});
