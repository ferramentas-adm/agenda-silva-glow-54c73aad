import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { brPartsOf, brTodayYMD } from "@/lib/timezone";

export interface OverdueMeeting {
  id: string;
  lead_name: string;
  lead_phone: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  closer_id: string | null;
  created_by: string | null;
  closer_name: string | null;
  creator_name: string | null;
}

const OVERDUE_GRACE_MINUTES = 65;

/**
 * "Agora" em minutos desde 1970, considerando o instante real (independe de fuso).
 * Usamos para comparar com o instante BRT da reunião reconstruído via brPartsOf.
 */
function nowEpochMin(): number {
  return Math.floor(Date.now() / 60000);
}

/**
 * Converte (scheduled_date, scheduled_time) — ambos em BRT — para minutos
 * desde a epoch. Como JS Date não interpreta diretamente um wall-time em
 * America/Sao_Paulo, calculamos o offset BRT no momento da reunião.
 */
function meetingEpochMin(date: string, time: string): number {
  // Monta como UTC primeiro (provisório)
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  // Descobre offset BRT no instante real: olhando as parts BRT desse mesmo Date.
  const parts = brPartsOf(new Date(utcGuess));
  const brAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // diff = quantos ms o "wall-time BRT" está adiantado em relação ao UTC do guess.
  const offsetMs = brAsUtc - utcGuess;
  // O instante UTC real da reunião = utcGuess - offset (BRT está atrás do UTC).
  const realUtc = utcGuess - offsetMs;
  return Math.floor(realUtc / 60000);
}

export function useOverdueMeetings() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isManager = role === "gestor" || role === "moderador";

  // Busca closer record por email — qualquer usuário pode ter um (cobre Vick: SDR+Closer).
  const { data: myCloserId } = useQuery({
    queryKey: ["overdue-meetings-closer-id", user?.email],
    enabled: !!user?.email && !isManager,
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

  // Yesterday + today (cobre virada de dia BRT)
  const today = brTodayYMD();
  const yesterday = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  }, [today]);

  const enabled = !!user && !isManager && myCloserId !== undefined;

  const query = useQuery<OverdueMeeting[]>({
    queryKey: ["overdue-meetings", user?.id, myCloserId, today],
    enabled,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, status, closer_id, created_by")
        .is("deleted_at", null)
        .in("status", ["agendada", "confirmada"])
        .gte("scheduled_date", yesterday)
        .lte("scheduled_date", today);

      const orParts: string[] = [];
      if (user?.id) orParts.push(`created_by.eq.${user.id}`);
      if (myCloserId) orParts.push(`closer_id.eq.${myCloserId}`);
      if (orParts.length === 0) return [];
      q = q.or(orParts.join(","));

      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as Omit<OverdueMeeting, "closer_name" | "creator_name">[];

      // Filtra só as vencidas (>= horário + 1h05)
      const nowMin = nowEpochMin();
      const overdue = list.filter(
        (m) => meetingEpochMin(m.scheduled_date, m.scheduled_time) + OVERDUE_GRACE_MINUTES <= nowMin,
      );
      if (overdue.length === 0) return [];

      // Busca nomes em lote
      const closerIds = Array.from(
        new Set(overdue.map((m) => m.closer_id).filter((v): v is string => !!v)),
      );
      const creatorIds = Array.from(
        new Set(overdue.map((m) => m.created_by).filter((v): v is string => !!v)),
      );
      const [closersRes, profilesRes] = await Promise.all([
        closerIds.length > 0
          ? supabase.from("closers").select("id, name").in("id", closerIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        creatorIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds)
          : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
      ]);
      const closerMap = new Map<string, string>();
      (closersRes.data ?? []).forEach((c) => closerMap.set(c.id, c.name));
      const creatorMap = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p) => creatorMap.set(p.user_id, p.full_name));

      return overdue.map((m) => ({
        ...m,
        closer_name: m.closer_id ? closerMap.get(m.closer_id) ?? null : null,
        creator_name: m.created_by ? creatorMap.get(m.created_by) ?? null : null,
      }));
    },
  });

  // Revalida ao voltar para a aba e a cada minuto via timer próprio
  // (refetchInterval do react-query já cuida do polling, mas pode pular se aba estiver em background).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        query.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [query]);

  // Realtime: atualizações na tabela agendamentos invalidam o cache
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("overdue-meetings-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agendamentos" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  return {
    overdue: query.data ?? [],
    count: query.data?.length ?? 0,
    myCloserId: myCloserId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
