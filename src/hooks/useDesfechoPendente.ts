import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCloserId } from "@/hooks/useMyCloserId";
import { brTodayYMD } from "@/lib/timezone";
import { isDesfechoPendente } from "@/lib/vendaConstants";

export interface DesfechoPendente {
  id: string;
  lead_name: string;
  scheduled_date: string;
  scheduled_time: string;
}

/**
 * Reuniões do closer logado marcadas como "Realizada" (normalmente pelo gestor)
 * em que o closer ainda não preencheu o desfecho completo.
 * O aviso considera SOMENTE reuniões de hoje — reuniões de dias anteriores
 * não geram alerta.
 */
export function useDesfechoPendente() {
  const { role } = useAuth();
  const { data: myCloserId } = useMyCloserId();
  const today = brTodayYMD();

  return useQuery<DesfechoPendente[]>({
    queryKey: ["desfecho-pendente", myCloserId, today],
    enabled: role === "closer" && !!myCloserId,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, lead_name, scheduled_date, scheduled_time, status, is_venda_avulsa, vendas(vendeu_closer, lead_revenue)")
        .eq("closer_id", myCloserId!)
        .eq("status", "realizada")
        .eq("is_venda_avulsa", false)
        .is("deleted_at", null)
        .eq("scheduled_date", today)
        .order("scheduled_date", { ascending: false })
        .order("scheduled_time", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .filter((a: any) => {
          const v = Array.isArray(a.vendas) ? a.vendas[0] : a.vendas;
          return isDesfechoPendente(a.status, v);
        })
        .map((a: any) => ({
          id: a.id,
          lead_name: a.lead_name,
          scheduled_date: a.scheduled_date,
          scheduled_time: a.scheduled_time,
        }));
    },
  });
}
