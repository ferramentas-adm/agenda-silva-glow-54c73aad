import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";

const KEY = "sdr_global_visibility";
const USERS_KEY = "sdr_global_visibility_users";

/**
 * Quando `enabled` é true, os SDRs cujos IDs estão em `userIds` visualizam
 * reuniões de todos os outros SDRs na Lista de Reuniões. Se `userIds` estiver
 * vazio, todos os SDRs recebem visibilidade global (compatibilidade retroativa
 * com o comportamento anterior).
 *
 * Controlado por gestor/moderador; persistido em app_settings.
 */
export function useSdrGlobalVisibility() {
  const qc = useQueryClient();

  const query = useQuery<{ enabled: boolean; userIds: string[] }>({
    queryKey: ["app-settings", KEY, USERS_KEY],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", [KEY, USERS_KEY]);
      const rows = data ?? [];
      const enabled = rows.find((r) => r.key === KEY)?.value === "true";
      let userIds: string[] = [];
      const raw = rows.find((r) => r.key === USERS_KEY)?.value;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) userIds = parsed.filter((v) => typeof v === "string");
        } catch {}
      }
      return { enabled, userIds };
    },
  });

  const upsertSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("app_settings")
      .select("id")
      .eq("key", key)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("app_settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("app_settings").insert({ key, value });
      if (error) throw error;
    }
  };

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      await upsertSetting(KEY, enabled ? "true" : "false");
      return enabled;
    },
    onSuccess: (enabled) => {
      qc.invalidateQueries({ queryKey: ["app-settings", KEY, USERS_KEY] });
      logAudit("update_settings", "settings", null as any, { key: KEY, value: enabled });
      toast.success(
        enabled
          ? "Visibilidade global de SDRs ativada"
          : "SDRs voltaram a visualizar apenas as próprias reuniões",
      );
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar configuração"),
  });

  const saveUsers = useMutation({
    mutationFn: async (userIds: string[]) => {
      await upsertSetting(USERS_KEY, JSON.stringify(userIds));
      return userIds;
    },
    onSuccess: (userIds) => {
      qc.invalidateQueries({ queryKey: ["app-settings", KEY, USERS_KEY] });
      logAudit("update_settings", "settings", null as any, { key: USERS_KEY, value: userIds });
      toast.success("Lista de SDRs com visibilidade global atualizada");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar lista de SDRs"),
  });

  const enabled = query.data?.enabled ?? false;
  const userIds = query.data?.userIds ?? [];

  return {
    enabled,
    userIds,
    /** Retorna true se o SDR informado deve ter visibilidade global. */
    hasGlobalVisibility: (userId?: string | null) => {
      if (!enabled || !userId) return false;
      // Lista vazia = todos os SDRs (compat retroativa).
      if (userIds.length === 0) return true;
      return userIds.includes(userId);
    },
    isLoading: query.isLoading,
    save: (v: boolean) => save.mutate(v),
    saveUsers: (ids: string[]) => saveUsers.mutate(ids),
    isSaving: save.isPending || saveUsers.isPending,
  };
}
