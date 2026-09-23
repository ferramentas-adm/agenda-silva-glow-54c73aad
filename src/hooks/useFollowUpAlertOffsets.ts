import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ALERT_OFFSETS, parseAlertOffsets } from "@/lib/followUp";
import { logAudit } from "@/services/auditLog";
import { toast } from "sonner";

const KEY = "followup_alert_offsets";

/** Minutos de antecedência dos alertas de follow-up (mínimo 3 avisos por dia). */
export function useFollowUpAlertOffsets() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["app-settings", KEY],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      return parseAlertOffsets(data?.value ?? null);
    },
  });

  const save = async (offsets: number[]) => {
    const clean = Array.from(
      new Set(offsets.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= 0 && n <= 1440)),
    ).sort((a, b) => b - a);
    if (clean.length < 3) {
      toast.error("Configure no mínimo 3 avisos por dia.");
      return false;
    }
    const value = JSON.stringify(clean);
    const { data: existing } = await supabase
      .from("app_settings")
      .select("id")
      .eq("key", KEY)
      .maybeSingle();
    const { error } = existing?.id
      ? await supabase
          .from("app_settings")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      : await supabase.from("app_settings").insert({ key: KEY, value });
    if (error) {
      toast.error(error.message || "Erro ao salvar os avisos");
      return false;
    }
    await logAudit("followup_alertas_configurados", "settings", null as any, { offsets: clean });
    queryClient.invalidateQueries({ queryKey: ["app-settings", KEY] });
    toast.success("Avisos de follow-up atualizados");
    return true;
  };

  return { offsets: query.data ?? DEFAULT_ALERT_OFFSETS, isLoading: query.isLoading, save };
}
