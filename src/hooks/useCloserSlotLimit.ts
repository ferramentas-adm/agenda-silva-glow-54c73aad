import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";

const KEY = "closer_slot_limit";
const DEFAULT_LIMIT = 2;

/** Limite de reuniões que um mesmo Closer pode ter no mesmo dia + horário. */
export function useCloserSlotLimit() {
  const qc = useQueryClient();

  const query = useQuery<number>({
    queryKey: ["app-settings", KEY],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      const n = data?.value ? parseInt(data.value, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
    },
  });

  const save = useMutation({
    mutationFn: async (limit: number) => {
      const value = String(Math.max(1, Math.floor(limit)));
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
      return Number(value);
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["app-settings", KEY] });
      logAudit("update_settings", "settings", null as any, { key: KEY, value: n });
      toast.success(`Limite atualizado para ${n} reuniões por Closer no mesmo horário`);
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar limite"),
  });

  return {
    limit: query.data ?? DEFAULT_LIMIT,
    isLoading: query.isLoading,
    save: (n: number) => save.mutate(n),
    isSaving: save.isPending,
  };
}
