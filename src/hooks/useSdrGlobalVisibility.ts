import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";

const KEY = "sdr_global_visibility";

/**
 * Quando true, SDRs visualizam reuniões de todos os outros SDRs na Lista de
 * Reuniões. Quando false, cada SDR só vê seus próprios agendamentos.
 * Controlado por gestor; persistido em app_settings.
 */
export function useSdrGlobalVisibility() {
  const qc = useQueryClient();

  const query = useQuery<boolean>({
    queryKey: ["app-settings", KEY],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      return data?.value === "true";
    },
  });

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      const value = enabled ? "true" : "false";
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", KEY)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("app_settings")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("app_settings").insert({ key: KEY, value });
        if (error) throw error;
      }
      return enabled;
    },
    onSuccess: (enabled) => {
      qc.invalidateQueries({ queryKey: ["app-settings", KEY] });
      logAudit("update_settings", "settings", null as any, { key: KEY, value: enabled });
      toast.success(
        enabled
          ? "SDRs agora visualizam reuniões de toda a equipe"
          : "SDRs voltaram a visualizar apenas as próprias reuniões",
      );
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar configuração"),
  });

  return {
    enabled: query.data ?? false,
    isLoading: query.isLoading,
    save: (v: boolean) => save.mutate(v),
    isSaving: save.isPending,
  };
}
