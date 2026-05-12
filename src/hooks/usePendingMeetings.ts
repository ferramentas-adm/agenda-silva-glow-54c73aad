import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { brTodayYMD } from "@/lib/timezone";

export interface PendingMeeting {
  id: string;
  lead_name: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  closer_id: string | null;
  created_by: string | null;
}

interface PendingMeta {
  closer_name: string | null;
  creator_name: string | null;
}

export interface PendingWithMeta extends PendingMeeting, PendingMeta {}

/**
 * Reuniões "pendentes": data agendada anterior a hoje (BRT) e ainda em
 * status `agendada` ou `confirmada` (sem desfecho final).
 *
 * Escopo:
 *  - SDR  → criadas por ele (`created_by = userId`)
 *  - Closer → onde ele é o closer (`closer_id` casa com `closers.email = auth.email()`)
 *  - Gestor / Moderador → todas
 */
export function usePendingMeetings() {
  const { user, role } = useAuth();
  const today = brTodayYMD();

  // Closer record (para descobrir closer_id quando o usuário é closer)
  const { data: myCloserId } = useQuery({
    queryKey: ["pending-meetings-closer-id", user?.email],
    enabled: role === "closer" && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id")
        .eq("email", user!.email!)
        .maybeSingle();
      return data?.id ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });

  const enabled =
    !!user &&
    !!role &&
    (role !== "closer" || !!myCloserId);

  const query = useQuery<PendingWithMeta[]>({
    queryKey: ["pending-meetings", role, user?.id, myCloserId, today],
    enabled,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("id, lead_name, scheduled_date, scheduled_time, status, closer_id, created_by")
        .is("deleted_at", null)
        .lt("scheduled_date", today)
        .in("status", ["agendada", "confirmada"])
        .order("scheduled_date", { ascending: false })
        .order("scheduled_time", { ascending: true });

      if (role === "sdr") {
        q = q.eq("created_by", user!.id);
      } else if (role === "closer" && myCloserId) {
        q = q.eq("closer_id", myCloserId);
      }
      // gestor/moderador: sem filtro extra

      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as PendingMeeting[];
      if (list.length === 0) return [];

      // Buscar nomes em lote
      const closerIds = Array.from(
        new Set(list.map((m) => m.closer_id).filter((v): v is string => !!v)),
      );
      const creatorIds = Array.from(
        new Set(list.map((m) => m.created_by).filter((v): v is string => !!v)),
      );

      const [closersRes, profilesRes] = await Promise.all([
        closerIds.length > 0
          ? supabase.from("closers").select("id, name").in("id", closerIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        creatorIds.length > 0
          ? supabase
              .from("profiles")
              .select("user_id, full_name")
              .in("user_id", creatorIds)
          : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
      ]);

      const closerMap = new Map<string, string>();
      (closersRes.data ?? []).forEach((c) => closerMap.set(c.id, c.name));
      const creatorMap = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p) => creatorMap.set(p.user_id, p.full_name));

      return list.map((m) => ({
        ...m,
        closer_name: m.closer_id ? closerMap.get(m.closer_id) ?? null : null,
        creator_name: m.created_by ? creatorMap.get(m.created_by) ?? null : null,
      }));
    },
  });

  const byCloser = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    (query.data ?? []).forEach((m) => {
      const key = m.closer_id ?? "_sem_closer";
      const name = m.closer_name ?? "Sem closer";
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { name, count: 1 });
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ closer_id: id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [query.data]);

  const bySdr = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    (query.data ?? []).forEach((m) => {
      const key = m.created_by ?? "_sem_sdr";
      const name = m.creator_name ?? "Sem SDR";
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { name, count: 1 });
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ sdr_id: id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [query.data]);

  return {
    pendings: query.data ?? [],
    count: query.data?.length ?? 0,
    byCloser,
    bySdr,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
