import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Contagem de agendas ativas (não canceladas, não deletadas) por horário
 * em um dia específico. Considera TODOS os closers somados — usado para
 * indicar slots lotados globalmente.
 *
 * Status incluídos: agendada, confirmada, realizada, no_show, reagendada.
 * Excluídos: cancelada, deletadas (deleted_at IS NOT NULL).
 *
 * Retorna Map<"HH:MM", number>.
 */
export function useSlotCounts(dateStr: string | null | undefined) {
  return useQuery<Map<string, number>>({
    queryKey: ["slot-counts", dateStr],
    enabled: !!dateStr,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("scheduled_time, status")
        .eq("scheduled_date", dateStr!)
        .is("deleted_at", null)
        .neq("status", "cancelada");
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const t = String(r.scheduled_time ?? "").slice(0, 5);
        if (!t) return;
        map.set(t, (map.get(t) ?? 0) + 1);
      });
      return map;
    },
  });
}
