import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCloserId } from "@/hooks/useMyCloserId";
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
  sdr_handoff_at: string | null;
  closer_handoff_at: string | null;
  closer_name: string | null;
  creator_name: string | null;
  /** Quem está com a responsabilidade AGORA: primeiro o SDR, depois o Closer.
   *  "both" = a mesma pessoa é o criador (SDR) e o closer da reunião. */
  stage: "sdr" | "closer" | "both";
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
  const isManager = role === "gestor" || (role === "moderador" || role === "apresentador") || role === "supervisor";

  // Closer record compartilhado — evita duplicar a query em cada hook/banner.
  const { data: myCloserId } = useMyCloserId();

  // Hoje em BRT; a busca precisa incluir QUALQUER data anterior ainda pendente.
  const today = brTodayYMD();

  const enabled = !!user && !isManager && myCloserId !== undefined;

  const query = useQuery<OverdueMeeting[]>({
    queryKey: ["overdue-meetings", user?.id, myCloserId, today],
    enabled,
    // P1: 5 min (antes 60s). Combinado com o refetch em visibilitychange abaixo,
    // cobre o caso real de uso sem gerar milhares de chamadas por sessão.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, status, closer_id, created_by, sdr_handoff_at, closer_handoff_at")
        .is("deleted_at", null)
        // "pendente" (Aguardando atribuição) NÃO trava ninguém: é responsabilidade
        // exclusiva de gestores/moderadores atribuir o closer.
        .in("status", ["agendada", "confirmada", "nao_confirmada"])
        .lte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      const orParts: string[] = [];
      if (user?.id) orParts.push(`created_by.eq.${user.id}`);
      if (myCloserId) orParts.push(`closer_id.eq.${myCloserId}`);
      if (orParts.length === 0) return [];
      q = q.or(orParts.join(","));

      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as Omit<OverdueMeeting, "closer_name" | "creator_name" | "stage">[];

      // Filtra só as vencidas (>= horário + 1h05)
      const nowMin = nowEpochMin();
      const overdueAll = list.filter(
        (m) => meetingEpochMin(m.scheduled_date, m.scheduled_time) + OVERDUE_GRACE_MINUTES <= nowMin,
      );

      // Fluxo em ETAPAS (nunca os dois ao mesmo tempo):
      //  1) SDR criador é travado primeiro (Cancelar / No-show / Reagendar).
      //  2) Se nada for factível, ele encaminha para o Closer (`sdr_handoff_at`),
      //     e a trava passa para o Closer (Realizada ou transferir para outro closer).
      const overdue = overdueAll
        .map((m) => ({ ...m, stage: (m.sdr_handoff_at ? "closer" : "sdr") as "sdr" | "closer" }))
        .filter((m) => {
          if (m.stage === "sdr") return !!user?.id && m.created_by === user.id;
          return !!myCloserId && m.closer_id === myCloserId;
        });



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

  // Revalida ao voltar para a aba (o polling em background está desligado).
  const refetch = query.refetch;
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refetch]);

  // Realtime: escuta as linhas que interessam a este usuário — as do closer dele
  // E as criadas por ele (quem é closer também pode criar agendamento, e a trava
  // da etapa SDR usa `created_by`). Eventos são agrupados em 1,5 s.
  useEffect(() => {
    if (!enabled) return;
    const filters: string[] = [];
    if (myCloserId) filters.push(`closer_id=eq.${myCloserId}`);
    if (user?.id) filters.push(`created_by=eq.${user.id}`);
    if (filters.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
      }, 1500);
    };

    let channel = supabase.channel(`overdue-meetings-${user?.id ?? myCloserId}`);
    filters.forEach((filter) => {
      channel = channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agendamentos", filter },
        bump,
      );
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, myCloserId, user?.id]);


  return {
    overdue: query.data ?? [],
    count: query.data?.length ?? 0,
    myCloserId: myCloserId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
