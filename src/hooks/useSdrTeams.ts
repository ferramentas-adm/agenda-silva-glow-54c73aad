import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SdrTeam } from "@/components/sdr/SdrTeamBadge";

/**
 * Retorna um Map<user_id, sdr_team> a partir dos profiles públicos.
 * Usado por Ranking / Produtividade / Erros SDR para filtrar e badgear.
 */
export function useSdrTeams() {
  const query = useQuery({
    queryKey: ["sdr-teams-map"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_profiles");
      if (error) throw error;
      const m = new Map<string, SdrTeam | null>();
      (data ?? []).forEach((row: any) => {
        m.set(row.user_id, (row.sdr_team as SdrTeam | null) ?? null);
      });
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { teamById: query.data ?? new Map<string, SdrTeam | null>(), isLoading: query.isLoading };
}
