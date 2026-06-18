import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";

/**
 * Hook genérico para gerenciar listas dinâmicas armazenadas em `app_settings`
 * (chave -> JSON array de strings). Inclui CRUD via mutations e ordenação A-Z.
 */
export function useAppSettingList(key: string, defaults: string[] = []) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["app-settings", key],
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      if (!data?.value) return [...defaults].sort((a, b) => a.localeCompare(b, "pt-BR"));
      try {
        const parsed = JSON.parse(data.value);
        if (!Array.isArray(parsed)) return [...defaults].sort((a, b) => a.localeCompare(b, "pt-BR"));
        return parsed
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .sort((a, b) => a.localeCompare(b, "pt-BR"));
      } catch {
        return [...defaults].sort((a, b) => a.localeCompare(b, "pt-BR"));
      }
    },
    staleTime: 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (items: string[]) => {
      const sorted = [...new Set(items.map((i) => i.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
      const value = JSON.stringify(sorted);
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
      return sorted;
    },
    onSuccess: (sorted) => {
      queryClient.invalidateQueries({ queryKey: ["app-settings", key] });
      logAudit("update_settings", "settings", null as any, { key, count: sorted.length });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar configuração");
    },
  });

  const add = (item: string) => {
    const current = query.data ?? [];
    if (!item.trim()) return;
    if (current.includes(item.trim())) {
      toast.error("Item já existe");
      return;
    }
    save.mutate([...current, item.trim()]);
  };

  const remove = (item: string) => {
    const current = query.data ?? [];
    save.mutate(current.filter((i) => i !== item));
  };

  const update = (oldItem: string, newItem: string) => {
    const current = query.data ?? [];
    if (!newItem.trim()) return;
    save.mutate(current.map((i) => (i === oldItem ? newItem.trim() : i)));
  };

  return { items: query.data ?? [], isLoading: query.isLoading, add, remove, update, isSaving: save.isPending };
}

// Constantes de chaves para evitar typos
export const APP_SETTING_KEYS = {
  motivos_nao_fechamento: "motivos_nao_fechamento",
  meeting_reasons: "meeting_reasons",
  channel_types: "channel_types",
  block_reasons: "block_reasons",
  produtos: "produtos",
} as const;

export const APP_SETTING_LABELS: Record<string, string> = {
  motivos_nao_fechamento: "Motivos de não fechamento",
  meeting_reasons: "Motivos da reunião",
  channel_types: "Tipos de canal",
  block_reasons: "Motivos de compromissos pessoais",
  produtos: "Produtos",
};

