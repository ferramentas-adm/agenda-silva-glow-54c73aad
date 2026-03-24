import { supabase } from "@/integrations/supabase/client";

export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const userName = user.user_metadata?.full_name || user.email || "Desconhecido";

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_name: userName,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
    });
  } catch (e) {
    console.warn("Audit log failed:", e);
  }
}
