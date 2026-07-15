import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Consolida a busca do closer_id do usuário logado numa única query
 * compartilhada por todos os hooks/banners (M5/M12). Antes cada consumidor
 * (AppLayout, PendingMeetings, OverdueMeetings, OverdueFollowUps) disparava
 * seu próprio `select id from closers where email = ?` — agora todos usam
 * a mesma cache key e a chamada acontece uma vez por sessão.
 */
export function useMyCloserId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-closer-id", user?.email],
    enabled: !!user?.email,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id")
        .eq("email", user!.email!)
        .maybeSingle();
      return data?.id ?? null;
    },
  });
}
