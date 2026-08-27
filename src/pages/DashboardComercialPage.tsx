import { useState, useMemo, useEffect, memo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isSameDay, parseISO, differenceInCalendarDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  Play, Pause, ChevronLeft, ChevronRight, ChevronDown, CalendarDays,
  TrendingUp, RefreshCw, Trophy, Users, Wifi, Eye, EyeOff,
  LayoutGrid,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { CalendarContent } from "@/pages/DashboardPage";

import VendasTab from "@/components/dashboard/VendasTab";
import ProdutividadeSDRTab from "@/components/dashboard/ProdutividadeSDRTab";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";
import CargaClosersTab from "@/components/dashboard/CargaClosersTab";
import ErrosTab from "@/components/dashboard/ErrosTab";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { splitNaoCompareceu } from "@/lib/noShowReasons";
import {
  computeAgendaMetrics,
  isCountableStatus,
  isSdrAgenda as isSdrAgendaShared,
  isSecondMeetingAgenda as isSecondMeetingAgendaShared,
} from "@/lib/agendaMetrics";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSlotCounts } from "@/hooks/useSlotCounts";
import { useSlotLimit } from "@/hooks/useSlotLimit";
import { brTodayYMD } from "@/lib/timezone";
import { countsAsSdr } from "@/lib/sdrOverrides";
import FacebookDateRangePicker, { type FBComparison } from "@/components/FacebookDateRangePicker";
import NaoComparecimentoTab from "@/components/dashboard/NaoComparecimentoTab";
import { SdrTeamBadge } from "@/components/sdr/SdrTeamBadge";
import { SdrTeamFilter, type SdrTeamFilterValue } from "@/components/sdr/SdrTeamFilter";

type TabKey = "metricas" | "agenda" | "ranking" | "vendas" | "produtividade" | "carga" | "erros_sdr" | "nao_comparecimento";

const TABS: { key: TabKey; label: string; gestorOnly?: boolean }[] = [
  { key: "metricas", label: "Métricas SDRs" },
  { key: "agenda", label: "Agenda Closers" },
  { key: "ranking", label: "Ranking SDRs" },
  { key: "vendas", label: "Vendas" },
  { key: "produtividade", label: "Produtividade SDR" },
  { key: "carga", label: "Follows Closer", gestorOnly: true },
  { key: "erros_sdr", label: "Erros", gestorOnly: true },
  { key: "nao_comparecimento", label: "Não comparecimento", gestorOnly: true },
];
const ROTATION_INTERVAL = 30000;

interface AgendamentoMetric {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  created_at: string;
  status: string;
  channel_type: string | null;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  original_agendamento_id: string | null;
  cancellation_reason: string | null;
  lead_phone: string | null;
  meeting_reason: string | null;
}

interface SDRProfile {
  user_id: string;
  full_name: string;
  sdr_team: "trafego" | "social_selling" | null;
}

// ─── Visibilidade de Abas (localStorage por usuário) ─────────────
const ALL_TAB_KEYS: TabKey[] = TABS.map((t) => t.key);
const visibilityStorageKey = (userId: string | null | undefined) =>
  `dashboard-tab-visibility:${userId ?? "anon"}`;

function loadVisibleTabs(userId: string | null | undefined): Set<TabKey> {
  try {
    const raw = localStorage.getItem(visibilityStorageKey(userId));
    if (!raw) return new Set(ALL_TAB_KEYS);
    const parsed = JSON.parse(raw) as TabKey[];
    const filtered = parsed.filter((k): k is TabKey => ALL_TAB_KEYS.includes(k));
    return filtered.length > 0 ? new Set(filtered) : new Set(ALL_TAB_KEYS);
  } catch {
    return new Set(ALL_TAB_KEYS);
  }
}

function saveVisibleTabs(userId: string | null | undefined, tabs: Set<TabKey>) {
  try {
    localStorage.setItem(visibilityStorageKey(userId), JSON.stringify(Array.from(tabs)));
  } catch {
    /* noop */
  }
}

// ─── Main Page ───────────────────────────────────────────────────
export default function DashboardComercialPage() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isGestor = role === "gestor";
  const isAdmin = role === "gestor" || (role === "moderador" || role === "apresentador");
  const isCloser = role === "closer";
  const allowedTabs = useMemo(
    () => isCloser
      ? TABS.filter((t) => t.key === "vendas")
      : TABS.filter((t) => !t.gestorOnly || isAdmin),
    [isAdmin, isCloser],
  );

  const [visibleTabs, setVisibleTabs] = useState<Set<TabKey>>(() => loadVisibleTabs(user?.id));
  const [activeTabKey, setActiveTabKey] = useState<TabKey>(isCloser ? "vendas" : "metricas");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [comparison, setComparison] = useState<FBComparison | null>(null);
  // M3: relógio movido para <LiveClock/> memoizado para não re-renderizar
  // a página inteira de 1.300 linhas a cada segundo. Mantemos apenas um
  // tick lento (30s) para atualizar a label "Atualizado há X min".
  const [updatedAgoTick, setUpdatedAgoTick] = useState(0);
  const [tabSettingsOpen, setTabSettingsOpen] = useState(false);

  // Recarrega preferências quando o usuário muda (login/logout)
  useEffect(() => {
    setVisibleTabs(loadVisibleTabs(user?.id));
  }, [user?.id]);

  // Persiste preferências no localStorage
  useEffect(() => {
    saveVisibleTabs(user?.id, visibleTabs);
  }, [user?.id, visibleTabs]);

  // Lista ordenada das abas atualmente visíveis (respeitando permissão de role)
  const visibleTabList = useMemo(
    () => allowedTabs.filter((t) => visibleTabs.has(t.key)),
    [visibleTabs, allowedTabs],
  );

  // Garante que activeTabKey continue sendo uma aba visível
  useEffect(() => {
    if (visibleTabList.length === 0) return;
    if (!visibleTabList.some((t) => t.key === activeTabKey)) {
      setActiveTabKey(visibleTabList[0].key);
    }
  }, [visibleTabList, activeTabKey]);

  const toggleTabVisibility = (key: TabKey) => {
    setVisibleTabs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Não permitir esconder todas as abas
        if (next.size === 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Tick lento (30s) só para recomputar a label "Atualizado há X min".
  // O HH:mm:ss vive em <LiveClock/> e re-renderiza isoladamente.
  useEffect(() => {
    const timer = setInterval(() => setUpdatedAgoTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Auto-rotation (apenas entre abas visíveis)
  useEffect(() => {
    if (!isPlaying || visibleTabList.length <= 1) return;
    const interval = setInterval(() => {
      setActiveTabKey((current) => {
        const idx = visibleTabList.findIndex((t) => t.key === current);
        const next = visibleTabList[(idx + 1) % visibleTabList.length];
        return next.key;
      });
    }, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [isPlaying, visibleTabList]);


  const dateStr = format(currentDate, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(currentDate, 1), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(currentDate, 1), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(subMonths(currentDate, 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(currentDate, 1)), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(currentDate, { locale: ptBR }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(currentDate, { locale: ptBR }), "yyyy-MM-dd");

  // Range ativo (intervalo selecionado pelo usuário)
  const isRangeActive = !!(dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to));
  const rangeFromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const rangeToStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;

  // Helper: pagina em blocos de 1000 (limite default do PostgREST).
  async function fetchAllAgendamentos(build: (q: any) => any): Promise<AgendamentoMetric[]> {
    const all: AgendamentoMetric[] = [];
    const pageSize = 1000;
    let from = 0;
    // hard cap defensivo
    for (let i = 0; i < 50; i++) {
      const { data, error } = await build(
        supabase
          .from("agendamentos")
          .select("id, scheduled_date, scheduled_time, created_at, status, channel_type, created_by, sdr_responsavel_id, original_agendamento_id, cancellation_reason, lead_phone, meeting_reason")
          .is("deleted_at", null)
      ).range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as AgendamentoMetric[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  // Broad fetch: all agendamentos for current month + adjacent days (+ range, se ativo)
  const { data: agendamentos = [], dataUpdatedAt } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-metrics", monthStart, monthEnd, yesterdayStr, tomorrowStr, rangeFromStr, rangeToStr],
    queryFn: async () => {
      let minDate = yesterdayStr < monthStart ? yesterdayStr : monthStart;
      let maxDate = tomorrowStr > monthEnd ? tomorrowStr : monthEnd;
      if (rangeFromStr && rangeFromStr < minDate) minDate = rangeFromStr;
      if (rangeToStr && rangeToStr > maxDate) maxDate = rangeToStr;
      return fetchAllAgendamentos((q) =>
        q.gte("scheduled_date", minDate).lte("scheduled_date", maxDate).order("scheduled_date")
      );
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // Previous month for comparison
  const { data: prevMonthAgs = [] } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-prev", prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      return fetchAllAgendamentos((q) =>
        q.gte("scheduled_date", prevMonthStart).lte("scheduled_date", prevMonthEnd)
      );
    },
    staleTime: 10 * 60 * 1000,
  });

  // Broad fetch for ranking: all agendamentos created in a wide range (for custom date ranges)
  const { data: createdAgs = [] } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-created", monthStart, monthEnd, rangeFromStr, rangeToStr],
    queryFn: async () => {
      let broadStart = format(subMonths(startOfMonth(currentDate), 2), "yyyy-MM-dd");
      let broadEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");
      if (rangeFromStr && rangeFromStr < broadStart) broadStart = rangeFromStr;
      if (rangeToStr && rangeToStr > broadEnd) broadEnd = rangeToStr;
      return fetchAllAgendamentos((q) =>
        q
          .gte("created_at", format(subDays(parseISO(broadStart), 1), "yyyy-MM-dd") + "T00:00:00")
          .lte("created_at", format(addDays(parseISO(broadEnd), 1), "yyyy-MM-dd") + "T23:59:59")
          .order("created_at", { ascending: false })
      );
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // Vendas (vendeu=true) para os agendamentos atuais — usado para coluna "Vendas / Taxa"
  const vendaAgIds = useMemo(() => {
    const s = new Set<string>();
    agendamentos.forEach(a => s.add(a.id));
    createdAgs.forEach(a => s.add(a.id));
    return Array.from(s).sort();
  }, [agendamentos, createdAgs]);

  // Assinatura estável do conjunto de IDs: a chave anterior usava apenas
  // (length, primeiro, último) e podia reaproveitar cache de conjuntos diferentes.
  const vendaAgIdsKey = useMemo(() => {
    let h = 0;
    for (const id of vendaAgIds) {
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    }
    return `${vendaAgIds.length}:${h}`;
  }, [vendaAgIds]);

  const { data: soldVendas = [] } = useQuery<{ agendamento_id: string; valor: number | null }[]>({
    queryKey: ["dashboard-comercial-vendas", vendaAgIdsKey],
    enabled: vendaAgIds.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const out: { agendamento_id: string; valor: number | null }[] = [];
      // 500 por bloco: acima disso a URL do PostgREST estoura e retorna 400.
      const chunkSize = 500;
      for (let i = 0; i < vendaAgIds.length; i += chunkSize) {
        const chunk = vendaAgIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("vendas")
          .select("agendamento_id, valor")
          .eq("vendeu", true)
          .in("agendamento_id", chunk);
        if (error) break;
        (data ?? []).forEach((v: { agendamento_id: string; valor: number | null }) =>
          out.push({ agendamento_id: v.agendamento_id, valor: v.valor }),
        );
      }
      return out;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const soldSet = useMemo(() => new Set(soldVendas.map(v => v.agendamento_id)), [soldVendas]);
  const soldValueMap = useMemo(() => {
    const m = new Map<string, number>();
    soldVendas.forEach(v => m.set(v.agendamento_id, Number(v.valor) || 0));
    return m;
  }, [soldVendas]);


  // SDR profiles
  const { data: sdrProfiles = [] } = useQuery<SDRProfile[]>({
    queryKey: ["sdr-profiles-ranking"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");
      const roleMap = new Map<string, string>((roles ?? []).map((r: any) => [r.user_id, r.role]));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, is_sdr_override, sdr_team")
        .eq("active", true);
      // Inclui usuários marcados com "Atua como SDR" no /admin (override DB)
      // ou em fallback por nome (legado). Gestores nunca entram.
      return ((profiles ?? []) as any[])
        .filter((p) => countsAsSdr({ role: roleMap.get(p.user_id), isOverride: p.is_sdr_override, fullName: p.full_name }))
        .map((p) => ({ user_id: p.user_id, full_name: p.full_name, sdr_team: p.sdr_team ?? null })) as SDRProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Mapa canônico user_id -> função, SEM filtro de ativo (usuário inativado não
  // muda o histórico das métricas). Mesmo mapa usado pelo Calendário.
  const { data: roleMap = new Map<string, string>() } = useQuery<Map<string, string>>({
    queryKey: ["agenda-metrics-role-map"],
    queryFn: async () => {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("user_id, full_name, is_sdr_override"),
      ]);
      const raw = new Map<string, string>((roles ?? []).map((r: any) => [r.user_id, r.role]));
      const m = new Map<string, string>(raw);
      ((profiles ?? []) as any[]).forEach((p) => {
        if (countsAsSdr({ role: raw.get(p.user_id), isOverride: p.is_sdr_override, fullName: p.full_name })) {
          m.set(p.user_id, "sdr");
        }
      });
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ─── Computed metrics ──────────────────────────────────────────
  // Regra de negócio: as contagens usam as métricas canônicas de
  // src/lib/agendaMetrics.ts — as MESMAS do Calendário (faixa superior),
  // para que os dois painéis nunca divirjam.


  const metrics = useMemo(() => {
    // Helper: converte timestamp ISO para YYYY-MM-DD no fuso de operação
    // (America/Sao_Paulo). Não depende do timezone do navegador — assim
    // uma reunião criada às 21h BRT (00h UTC do dia seguinte) é sempre
    // contabilizada no dia BRT correto, independentemente de onde o
    // gestor esteja acessando.
    const BR_TZ = "America/Sao_Paulo";
    const brDateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: BR_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const localDateOf = (iso: string): string => brDateFmt.format(new Date(iso));

    // Pool base canônico: status válidos (sem `pendente`) e agenda de SDR ou 2ª
    // reunião de closer — recorte idêntico ao do Calendário.
    const isSdrAg = (a: AgendamentoMetric) => isSdrAgendaShared(a, roleMap);
    const inScope = (a: AgendamentoMetric) =>
      isCountableStatus(a.status) && (isSdrAg(a) || isSecondMeetingAgendaShared(a, roleMap));

    const sdrAgs = agendamentos.filter(inScope);
    // Para "Geradas/Criadas" usamos o pool fetched por created_at (createdAgs)
    // — assim incluímos reuniões criadas hoje mesmo que agendadas para fora
    // do range mensal (o pool `agendamentos` é filtrado por scheduled_date).
    const sdrCreatedAgs = createdAgs.filter(
      a => isSdrAg(a) && !a.original_agendamento_id,
    );


    // Quando há intervalo ativo, "todayAgs"/"todayCreated" passam a ser
    // a soma agregada de todo o período selecionado. Caso contrário, mantém
    // o comportamento de dia único (currentDate).
    // OBS: todos os totais incluem canceladas — alinhado ao card "Total agend. dia"
    // do Dashboard. Mudanças nessa regra devem ser refletidas no DashboardPage.tsx.
    const todayAgs = isRangeActive && rangeFromStr && rangeToStr
      ? sdrAgs.filter(a => a.scheduled_date >= rangeFromStr && a.scheduled_date <= rangeToStr)
      : sdrAgs.filter(a => a.scheduled_date === dateStr);
    const todayCreated = isRangeActive && rangeFromStr && rangeToStr
      ? sdrCreatedAgs.filter(a => {
          const d = localDateOf(a.created_at);
          return d >= rangeFromStr && d <= rangeToStr;
        })
      : sdrCreatedAgs.filter(a => localDateOf(a.created_at) === dateStr);
    const yesterdayAgs = sdrAgs.filter(a => a.scheduled_date === yesterdayStr);
    const tomorrowAgs = sdrAgs.filter(a => a.scheduled_date === tomorrowStr);
    const monthAgs = sdrAgs.filter(a => a.scheduled_date >= monthStart && a.scheduled_date <= monthEnd);

    const sc = (list: AgendamentoMetric[], s: string) => list.filter(a => a.status === s).length;

    // Mapa user_id -> nome do SDR (já filtrado em sdrProfiles para incluir overrides).
    const sdrNameMap = new Map(sdrProfiles.map((p) => [p.user_id, p.full_name]));
    const sdrIdOf = (a: AgendamentoMetric): string | null =>
      a.sdr_responsavel_id || a.created_by || null;

    type ChannelAgg = {
      ids: string[]; idsRealizadas: string[]; idsVendas: string[]; valorVendas: number;
      bySdr: Map<string, { ids: string[]; idsRealizadas: string[]; idsVendas: string[]; valorVendas: number }>;
    };

    const byChannel = (list: AgendamentoMetric[]) => {
      const map = new Map<string, ChannelAgg>();
      list.forEach(a => {
        const ch = a.channel_type || "Sem canal";
        let cur = map.get(ch);
        if (!cur) {
          cur = { ids: [], idsRealizadas: [], idsVendas: [], valorVendas: 0, bySdr: new Map() };
          map.set(ch, cur);
        }
        cur.ids.push(a.id);
        if (a.status === "realizada") cur.idsRealizadas.push(a.id);
        const sold = soldSet.has(a.id);
        const valor = sold ? (soldValueMap.get(a.id) || 0) : 0;
        if (sold) { cur.idsVendas.push(a.id); cur.valorVendas += valor; }

        const sdrId = sdrIdOf(a);
        if (sdrId && sdrNameMap.has(sdrId)) {
          let bucket = cur.bySdr.get(sdrId);
          if (!bucket) {
            bucket = { ids: [], idsRealizadas: [], idsVendas: [], valorVendas: 0 };
            cur.bySdr.set(sdrId, bucket);
          }
          bucket.ids.push(a.id);
          if (a.status === "realizada") bucket.idsRealizadas.push(a.id);
          if (sold) { bucket.idsVendas.push(a.id); bucket.valorVendas += valor; }
        }
      });
      return Array.from(map.entries())
        .sort((a, b) => b[1].ids.length - a[1].ids.length)
        .map(([canal, v], i) => ({
          num: i + 1,
          canal,
          qtd: v.ids.length,
          ids: v.ids,
          qtdRealizadas: v.idsRealizadas.length,
          idsRealizadas: v.idsRealizadas,
          qtdVendas: v.idsVendas.length,
          idsVendas: v.idsVendas,
          valorVendas: v.valorVendas,
          sdrBreakdown: Array.from(v.bySdr.entries())
            .map(([sdrId, b]) => ({
              sdrId,
              sdrName: sdrNameMap.get(sdrId) || "—",
              qtd: b.ids.length,
              ids: b.ids,
              qtdRealizadas: b.idsRealizadas.length,
              idsRealizadas: b.idsRealizadas,
              qtdVendas: b.idsVendas.length,
              idsVendas: b.idsVendas,
              valorVendas: b.valorVendas,
            }))
            .sort((a, b) => b.qtd - a.qtd),
        }));
    };

    // Contagens canônicas do dia/período (mesma função do Calendário).
    const dayM = computeAgendaMetrics(todayAgs as any, roleMap);
    const totalDia = dayM.totalAgend;
    const taxaComp = totalDia > 0 ? (dayM.realizada / totalDia) * 100 : 0;

    const prevMonthSdr = prevMonthAgs.filter(inScope);

    return {
      todayScheduled: totalDia,
      todayCreated: todayCreated.length,
      yesterdayScheduled: yesterdayAgs.length,
      tomorrowScheduled: tomorrowAgs.length,
      monthTotal: monthAgs.length,
      monthDiff: monthAgs.length - prevMonthSdr.length,
      confirmado: dayM.confirmada,
      agendado: dayM.agendada,
      compareceu: dayM.realizada,
      noShow: dayM.noShow,
      cancelado: dayM.cancelada,
      taxaComp,
      totalDia,
      channelsToday: byChannel(todayAgs),
      channelsCreatedToday: byChannel(todayCreated),
      // IDs para drill-down
      todayScheduledIds: dayM.ids.total,
      todayCreatedIds: todayCreated.map(a => a.id),
      yesterdayScheduledIds: yesterdayAgs.map(a => a.id),
      tomorrowScheduledIds: tomorrowAgs.map(a => a.id),
      monthTotalIds: monthAgs.map(a => a.id),
      confirmadoIds: dayM.ids.confirmada,
      agendadoIds: dayM.ids.agendada,
      compareceuIds: dayM.ids.realizada,
      noShowIds: dayM.ids.noShow,
      canceladoIds: dayM.ids.cancelada,
    };
  }, [agendamentos, createdAgs, prevMonthAgs, dateStr, yesterdayStr, tomorrowStr, monthStart, monthEnd, roleMap, sdrProfiles, isRangeActive, rangeFromStr, rangeToStr, soldSet, soldValueMap]);



  // ─── Ranking is now computed inside RankingSDRsTab from raw data ──

  const updatedAgo = useMemo(() => {
    if (!dataUpdatedAt) return "";
    const diff = Math.floor((Date.now() - dataUpdatedAt) / 60000);
    if (diff < 1) return "Atualizado agora";
    return `Atualizado há ${diff} minuto${diff > 1 ? "s" : ""}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, updatedAgoTick]);

  const goPrev = () => { setDateRange(undefined); setCurrentDate(d => subDays(d, 1)); };
  const goNext = () => { setDateRange(undefined); setCurrentDate(d => addDays(d, 1)); };
  const goToday = () => { setDateRange(undefined); setCurrentDate(new Date()); };

  /** Desloca o período atual: 1 dia (dia único) ou o tamanho do intervalo. */
  const shiftPeriod = (direction: -1 | 1) => {
    const from = dateRange?.from ?? currentDate;
    const to = dateRange?.to ?? currentDate;
    const span = differenceInCalendarDays(to, from) + 1;
    const newFrom = addDays(from, direction * span);
    const newTo = addDays(to, direction * span);
    setCurrentDate(newFrom);
    if (span <= 1) setDateRange(undefined);
    else setDateRange({ from: newFrom, to: newTo });
  };


  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-comercial-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-comercial-prev"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-comercial-created"] });
    queryClient.invalidateQueries({ queryKey: ["sdr-profiles-ranking"] });
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4">
        {/* ─── Header bar ────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Play/Pause + Tabs */}
          {!isCloser && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? "Pausar rotação" : "Iniciar rotação"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>
          )}

          <div className="flex gap-1 flex-wrap">
            {visibleTabList.map((tab) => (
              <Button
                key={tab.key}
                variant={activeTabKey === tab.key ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs",
                  activeTabKey === tab.key && "bg-primary text-primary-foreground"
                )}
                onClick={() => { setActiveTabKey(tab.key); setIsPlaying(false); }}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Visibilidade de Abas */}
          {!isCloser && (
          <Popover open={tabSettingsOpen} onOpenChange={setTabSettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title="Visibilidade de abas"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Abas visíveis
                </p>
                <div className="space-y-1.5">
                  {allowedTabs.map((tab) => {
                    const checked = visibleTabs.has(tab.key);
                    const onlyOne = visibleTabs.size === 1 && checked;
                    return (
                      <label
                        key={tab.key}
                        className={cn(
                          "flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors",
                          onlyOne && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={onlyOne}
                          onCheckedChange={() => toggleTabVisibility(tab.key)}
                        />
                        <span>{tab.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Preferência salva por usuário neste dispositivo.
                </p>
              </div>
            </PopoverContent>
          </Popover>
          )}

          {/* Clock + Online */}
          <div className="ml-auto flex items-center gap-4">
            <span className="text-lg font-mono font-bold tracking-tight">
              <LiveClock />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Wifi className="h-3.5 w-3.5" />
              Online
            </span>
          </div>
        </div>

        {/* ─── Date nav (oculta na aba Agenda Closers) ──── */}
        {activeTabKey !== "agenda" && activeTabKey !== "carga" && (
          <div className="flex items-center gap-3">
            <div className="ml-auto flex items-center gap-1">

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftPeriod(-1)} title="Período anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <FacebookDateRangePicker

                value={{
                  from: dateRange?.from ?? currentDate,
                  to: dateRange?.to ?? currentDate,
                }}
                comparison={comparison}
                onChange={(period, cmp) => {
                  setComparison(cmp);
                  setCurrentDate(period.from);
                  if (isSameDay(period.from, period.to)) {
                    setDateRange(undefined);
                  } else {
                    setDateRange({ from: period.from, to: period.to });
                  }
                }}
                align="start"
                className="h-7 ml-1"
                buttonSize="sm"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftPeriod(1)} title="Período seguinte">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={handleRefresh} title="Atualizar dados">

                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Tab content ────────────────────────────────── */}
        {activeTabKey === "metricas" && (
          <MetricasSDRsTab
            metrics={metrics}
            currentDate={currentDate}
            updatedAgo={updatedAgo}
            dateRange={isRangeActive ? dateRange : undefined}
          />
        )}
        {activeTabKey === "agenda" && <CalendarContent />}
        {activeTabKey === "ranking" && (
          <RankingSDRsTab
            sdrProfiles={sdrProfiles}
            updatedAgo={updatedAgo}
            createdAgs={createdAgs}
            agendamentos={agendamentos}
            currentDate={currentDate}
            dateRange={dateRange}
          />
        )}
        {activeTabKey === "vendas" && <VendasTab currentDate={currentDate} dateRange={dateRange} />}
        {activeTabKey === "produtividade" && (
          <ProdutividadeSDRTab
            agendamentos={agendamentos}
            createdAgs={createdAgs}
            sdrProfiles={sdrProfiles}
            currentDate={currentDate}
            dateRange={dateRange}
            updatedAgo={updatedAgo}
          />
        )}
        
        {activeTabKey === "carga" && isAdmin && <CargaClosersTab />}
        {activeTabKey === "erros_sdr" && isAdmin && (
          <ErrosTab currentDate={currentDate} dateRange={dateRange} />
        )}
        {activeTabKey === "nao_comparecimento" && isAdmin && (
          <NaoComparecimentoTab
            currentDate={currentDate}
            dateRange={isRangeActive ? dateRange : undefined}
            updatedAgo={updatedAgo}
          />
        )}
        
      </div>
    </AppLayout>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────
function MetricCard({
  title,
  value,
  subtitle,
  highlight,
  icon,
  onClick,
  tooltip,
}: {
  title: string;
  value: number | string;
  subtitle: React.ReactNode;
  highlight?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  tooltip?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={tooltip}
      className={cn(
        "rounded-xl border p-4 space-y-2 transition-all text-left w-full",
        onClick && "hover:border-primary/60 hover:shadow-md cursor-pointer",
        highlight
          ? "border-primary/40 bg-primary/10"
          : "border-primary/10 bg-card"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        {icon || <CalendarDays className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}

// ─── Horários Lotados Hoje ──────────────────────────────────────
function FullSlotsTodayCard() {
  const today = brTodayYMD();
  const { data: counts } = useSlotCounts(today);
  const { limit } = useSlotLimit();

  const fullSlots = useMemo(() => {
    if (!counts) return [] as { time: string; count: number; capacity: number }[];
    return Array.from(counts.entries())
      .filter(([, info]) => info.full)
      .map(([time, info]) => ({ time, count: info.count, capacity: info.capacity }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [counts]);

  const nearlyFull = useMemo(() => {
    if (!counts) return [] as { time: string; count: number; capacity: number }[];
    return Array.from(counts.entries())
      .filter(([, info]) => !info.full && info.capacity > 0 && info.count >= Math.max(1, info.capacity - 2))
      .map(([time, info]) => ({ time, count: info.count, capacity: info.capacity }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [counts]);

  if (fullSlots.length === 0 && nearlyFull.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-red-500">
          Horários cheios hoje (todos os closers ocupados)
        </div>
        <div className="text-xs text-muted-foreground">
          SDR não consegue mais agendar nos horários lotados.
        </div>
      </div>
      {fullSlots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fullSlots.map((s) => (
            <span key={s.time} className="inline-flex items-center gap-1 rounded-full bg-red-500 text-white px-2.5 py-0.5 text-xs font-bold">
              {s.time} · {s.count}/{s.capacity}
            </span>
          ))}
        </div>
      )}
      {nearlyFull.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quase lotados:</span>
          {nearlyFull.map((s) => (
            <span key={s.time} className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-semibold">
              {s.time} · {s.count}/{s.capacity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Channel Table ───────────────────────────────────────────────
type SdrBreakdownRow = {
  sdrId: string;
  sdrName: string;
  qtd: number;
  ids: string[];
  qtdRealizadas: number;
  idsRealizadas: string[];
  qtdVendas: number;
  idsVendas: string[];
  valorVendas: number;
};

type ChannelRow = {
  num: number;
  canal: string;
  qtd: number;
  ids: string[];
  qtdRealizadas: number;
  idsRealizadas: string[];
  qtdVendas: number;
  idsVendas: string[];
  valorVendas: number;
  sdrBreakdown?: SdrBreakdownRow[];
};

function ChannelTable({
  title,
  data,
  onRowClick,
}: {
  title: string;
  data: ChannelRow[];
  onRowClick?: (row: { canal: string; ids: string[]; mode: "todas" | "realizadas" | "vendas" }) => void;
}) {
  const [mode, setMode] = useState<"todas" | "realizadas" | "vendas">("todas");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (canal: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(canal) ? next.delete(canal) : next.add(canal);
      return next;
    });

  const rows = useMemo(() => {
    const mapped = data.map((r) => ({
      ...r,
      currentQtd: mode === "todas" ? r.qtd : mode === "realizadas" ? r.qtdRealizadas : r.qtdVendas,
      currentIds: mode === "todas" ? r.ids : mode === "realizadas" ? r.idsRealizadas : r.idsVendas,
    }));
    const filtered = mode !== "todas" ? mapped.filter((r) => r.currentQtd > 0) : mapped;
    return filtered
      .sort((a, b) => b.currentQtd - a.currentQtd)
      .map((r, i) => ({ ...r, num: i + 1 }));
  }, [data, mode]);

  const showTaxa = mode !== "todas";
  const tabBtn = (key: "todas" | "realizadas" | "vendas", label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={cn(
        "px-2.5 py-1 text-xs rounded transition-colors",
        mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );

  const baseColSpan = 3 + (mode === "vendas" ? 1 : 0) + (showTaxa ? 1 : 0);
  const fmtMoney = (v: number) =>
    v > 0
      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : "—";
  const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="inline-flex rounded-md border border-primary/10 p-0.5 bg-muted/30">
          {tabBtn("todas", "Todas")}
          {tabBtn("realizadas", "Realizadas")}
          {tabBtn("vendas", "Vendas")}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-muted-foreground">
              <th className="text-left py-2 px-2 font-medium text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-xs">Canal</th>
              <th className="text-right py-2 px-2 font-medium text-xs">
                {mode === "vendas" ? "Vendas" : "Qtd"}
              </th>
              {mode === "vendas" && (
                <th className="text-right py-2 px-2 font-medium text-xs">Valor</th>
              )}
              {showTaxa && (
                <th className="text-right py-2 px-2 font-medium text-xs">Taxa</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={baseColSpan} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum registro
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isOpen = expanded.has(row.canal);
              const hasBreakdown = (row.sdrBreakdown?.length ?? 0) > 0;
              return (
                <Fragment key={row.canal}>
                  <tr className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                    <td className="py-2 px-2 text-muted-foreground">{row.num}</td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => hasBreakdown && toggleExpand(row.canal)}
                        className={cn(
                          "inline-flex items-center gap-1.5 font-medium text-left",
                          hasBreakdown ? "hover:text-primary cursor-pointer" : "cursor-default",
                        )}
                        title={hasBreakdown ? (isOpen ? "Recolher SDRs" : "Ver produção por SDR") : undefined}
                      >
                        {hasBreakdown && (
                          isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {row.canal}
                      </button>
                    </td>
                    <td
                      className={cn("py-2 px-2 text-right font-bold tabular-nums", onRowClick && row.currentIds.length > 0 && "cursor-pointer hover:text-primary")}
                      onClick={onRowClick && row.currentIds.length > 0 ? () => onRowClick({ canal: row.canal, ids: row.currentIds, mode }) : undefined}
                    >
                      {row.currentQtd}
                    </td>
                    {mode === "vendas" && (
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">
                        {fmtMoney(row.valorVendas)}
                      </td>
                    )}
                    {showTaxa && (
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                        {row.qtd > 0
                          ? `${(((mode === "realizadas" ? row.qtdRealizadas : row.qtdVendas) / row.qtd) * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                    )}
                  </tr>
                  {isOpen && hasBreakdown && (
                    <tr key={`${row.canal}-detail`} className="bg-muted/10">
                      <td colSpan={baseColSpan} className="px-2 py-2">
                        <div className="rounded-lg border border-primary/10 bg-background/50 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground border-b border-primary/10">
                                <th className="text-left py-1.5 px-2 font-medium">SDR</th>
                                <th className="text-right py-1.5 px-2 font-medium">Agend.</th>
                                <th className="text-right py-1.5 px-2 font-medium">Realiz.</th>
                                <th className="text-right py-1.5 px-2 font-medium">Vendas</th>
                                <th className="text-right py-1.5 px-2 font-medium">Valor (R$)</th>
                                <th className="text-right py-1.5 px-2 font-medium">Tx. Comparec.</th>
                                <th className="text-right py-1.5 px-2 font-medium">Tx. Conversão</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.sdrBreakdown!.map((s) => (
                                <tr key={s.sdrId} className="border-b border-primary/5 last:border-b-0">
                                  <td className="py-1.5 px-2 font-medium">{s.sdrName}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{s.qtd}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-emerald-500">{s.qtdRealizadas}</td>
                                  <td className={cn("py-1.5 px-2 text-right tabular-nums", s.qtdVendas > 0 ? "text-primary font-semibold" : "text-muted-foreground")}>{s.qtdVendas}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums">{s.valorVendas > 0 ? s.valorVendas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{pct(s.qtdRealizadas, s.qtd)}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{pct(s.qtdVendas, s.qtdRealizadas)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Date label helpers ──────────────────────────────────────────
function getDateLabel(selectedDate: Date, targetDate: Date, prefix: string) {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
  const targetStr = format(targetDate, "yyyy-MM-dd");

  if (targetStr === todayStr) {
    if (prefix === "Para") return "Agendas Para Hoje";
    if (prefix === "Geradas") return "Agendas Geradas Hoje";
    if (prefix === "De") return "Agendas De Hoje";
  }
  if (targetStr === yesterdayStr) {
    if (prefix === "Para") return "Agendas Para Ontem";
    if (prefix === "Geradas") return "Agendas Geradas Ontem";
    if (prefix === "De") return "Agendas De Ontem";
  }
  if (targetStr === tomorrowStr) {
    if (prefix === "Para") return "Agendas Para Amanhã";
    if (prefix === "Geradas") return "Agendas Geradas Amanhã";
    if (prefix === "De") return "Agendas De Amanhã";
  }
  const dayBefore = format(subDays(today, 2), "yyyy-MM-dd");
  if (targetStr === dayBefore && prefix === "De") return "Agendas De Anteontem";

  const formatted = format(targetDate, "dd/MM/yyyy");
  return `Agendas ${prefix} ${formatted}`;
}

function getChannelTableLabel(selectedDate: Date, type: "para" | "criadas") {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
  const selectedStr = format(selectedDate, "yyyy-MM-dd");

  let period = format(selectedDate, "dd/MM/yyyy");
  if (selectedStr === todayStr) period = "Hoje";
  else if (selectedStr === yesterdayStr) period = "Ontem";
  else if (selectedStr === tomorrowStr) period = "Amanhã";

  if (type === "para") return `Agendas Para ${period} — por Canal`;
  return `Agendas Criadas ${period} — por Canal`;
}

function getSubtitleLabel(targetDate: Date) {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
  const targetStr = format(targetDate, "yyyy-MM-dd");

  if (targetStr === todayStr) return "Hoje";
  if (targetStr === yesterdayStr) return "Ontem";
  if (targetStr === tomorrowStr) return "Amanhã";
  return format(targetDate, "dd/MM/yyyy");
}

// ─── Métricas SDRs Tab ──────────────────────────────────────────
function MetricasSDRsTab({
  metrics,
  currentDate,
  updatedAgo,
  dateRange,
}: {
  metrics: ReturnType<any>;
  currentDate: Date;
  updatedAgo: string;
  dateRange?: DateRange;
}) {
  const isRange = !!(dateRange?.from && dateRange?.to);
  const rangeLabel = isRange
    ? `${format(dateRange!.from!, "dd/MM/yyyy")} a ${format(dateRange!.to!, "dd/MM/yyyy")}`
    : "";

  const prevDay = subDays(currentDate, 1);
  const nextDay = addDays(currentDate, 1);

  const titlePara = isRange
    ? `Agendas Para ${rangeLabel}`
    : getDateLabel(currentDate, currentDate, "Para");
  const titleGeradas = isRange
    ? `Agendas Geradas ${rangeLabel}`
    : getDateLabel(currentDate, currentDate, "Geradas");
  const titleDe = getDateLabel(currentDate, prevDay, "De");
  const titleAmanha = getDateLabel(currentDate, nextDay, "Para");

  const subtitleSelected = isRange ? rangeLabel : getSubtitleLabel(currentDate);
  const subtitlePrev = getSubtitleLabel(prevDay);
  const subtitleNext = getSubtitleLabel(nextDay);

  const selectedLabel = isRange ? rangeLabel : getSubtitleLabel(currentDate);
  const monthLabel = format(currentDate, "MMMM/yyyy", { locale: ptBR });

  const [drillIds, setDrillIds] = useState<string[] | null>(null);
  const [drillTitle, setDrillTitle] = useState("");

  const openDrill = (title: string, ids: string[]) => {
    setDrillTitle(title);
    setDrillIds(ids);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">Métricas de Agendamentos — {selectedLabel}</h2>
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard title={titlePara} value={metrics.todayScheduled} subtitle={subtitleSelected} highlight onClick={() => openDrill(titlePara, metrics.todayScheduledIds)} />
        <MetricCard title={titleGeradas} value={metrics.todayCreated} subtitle={subtitleSelected} onClick={() => openDrill(titleGeradas, metrics.todayCreatedIds)} tooltip="Conta apenas agendas novas criadas por SDRs. Exclui reagendamentos (que herdam o registro original) e agendas criadas por closers/gestores. Para conciliar com a Lista de Reuniões, ative 'Excluir reagendamentos' lá." />
        <MetricCard title={titleDe} value={metrics.yesterdayScheduled} subtitle={subtitlePrev} onClick={() => openDrill(titleDe, metrics.yesterdayScheduledIds)} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard title={titleAmanha} value={metrics.tomorrowScheduled} subtitle={subtitleNext} onClick={() => openDrill(titleAmanha, metrics.tomorrowScheduledIds)} />
        <MetricCard
          title={`Total ${monthLabel}`}
          value={metrics.monthTotal}
          subtitle={
            <span>
              <span className={metrics.monthDiff >= 0 ? "text-emerald-400" : "text-destructive"}>
                {metrics.monthDiff >= 0 ? "+" : ""}{metrics.monthDiff}
              </span>
              {" "}vs mês anterior
            </span>
          }
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          onClick={() => openDrill(`Total ${monthLabel}`, metrics.monthTotalIds)}
        />
        <MetricCard title={`Confirmado — ${selectedLabel}`} value={metrics.confirmado} subtitle={subtitleSelected} onClick={() => openDrill(`Confirmado — ${selectedLabel}`, metrics.confirmadoIds)} />
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title={`Agendado — ${selectedLabel}`} value={metrics.agendado} subtitle={subtitleSelected} onClick={() => openDrill(`Agendado — ${selectedLabel}`, metrics.agendadoIds)} />
        <MetricCard title={`Compareceu — ${selectedLabel}`} value={metrics.compareceu} subtitle={subtitleSelected} onClick={() => openDrill(`Compareceu — ${selectedLabel}`, metrics.compareceuIds)} />
        <MetricCard title={`No-show — ${selectedLabel}`} value={metrics.noShow} subtitle={subtitleSelected} onClick={() => openDrill(`No-show — ${selectedLabel}`, metrics.noShowIds)} />
        <MetricCard title={`Cancelado — ${selectedLabel}`} value={metrics.cancelado} subtitle={subtitleSelected} onClick={() => openDrill(`Cancelado — ${selectedLabel}`, metrics.canceladoIds)} />
        <MetricCard
          title={`Taxa de Comparecimento — ${selectedLabel}`}
          value={`${metrics.taxaComp.toFixed(1)}%`}
          subtitle={
            <span>
              {metrics.compareceu} de {metrics.totalDia} agendamento{metrics.totalDia !== 1 ? "s" : ""}
            </span>
          }
          onClick={() => openDrill(`Compareceu — ${selectedLabel}`, metrics.compareceuIds)}
        />
      </div>

      {/* Horários lotados hoje */}
      <FullSlotsTodayCard />

      {/* Channel tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChannelTable
          title={isRange ? `Agendas Para ${rangeLabel} — por Canal` : getChannelTableLabel(currentDate, "para")}
          data={metrics.channelsToday}
          onRowClick={({ canal, ids, mode }) => openDrill(`${isRange ? `Agendas Para ${rangeLabel}` : getChannelTableLabel(currentDate, "para").replace(" — por Canal", "")} — ${canal}${mode === "realizadas" ? " · Realizadas" : mode === "vendas" ? " · Vendas" : ""}`, ids)}
        />
        <ChannelTable
          title={isRange ? `Agendas Criadas ${rangeLabel} — por Canal` : getChannelTableLabel(currentDate, "criadas")}
          data={metrics.channelsCreatedToday}
          onRowClick={({ canal, ids, mode }) => openDrill(`${isRange ? `Agendas Criadas ${rangeLabel}` : getChannelTableLabel(currentDate, "criadas").replace(" — por Canal", "")} — ${canal}${mode === "realizadas" ? " · Realizadas" : mode === "vendas" ? " · Vendas" : ""}`, ids)}
        />
      </div>

      <MetricDrilldownDialog
        open={drillIds !== null}
        onOpenChange={(o) => !o && setDrillIds(null)}
        title={drillTitle}
        agendamentoIds={drillIds || []}
      />
    </div>
  );
}

// ─── Ranking SDRs Tab ────────────────────────────────────────────
type RankingMetricType = "criadas" | "para" | "compareceu";
type RankingPeriodKey = "hoje" | "ontem" | "amanha" | "semana" | "quinzena" | "mes" | "data" | "intervalo";

const METRIC_OPTIONS: { key: RankingMetricType; label: string; description: string }[] = [
  { key: "criadas", label: "Criadas", description: "Agendamentos criados pelo SDR no período" },
  { key: "para", label: "Para", description: "Agendamentos cuja reunião está marcada para o período" },
  { key: "compareceu", label: "Compareceu", description: "Reuniões realizadas no período" },
];

const PERIOD_OPTIONS: { key: RankingPeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "amanha", label: "Amanhã" },
  { key: "semana", label: "Semana" },
  { key: "quinzena", label: "Quinzena" },
  { key: "mes", label: "Mês" },
  { key: "data", label: "Data específica" },
  { key: "intervalo", label: "Período" },
];

function RankingSDRsTab({
  sdrProfiles,
  updatedAgo,
  createdAgs,
  agendamentos,
  currentDate,
  dateRange,
}: {
  sdrProfiles: SDRProfile[];
  updatedAgo: string;
  createdAgs: AgendamentoMetric[];
  agendamentos: AgendamentoMetric[];
  currentDate: Date;
  dateRange?: DateRange;
}) {
  const [metricType, setMetricType] = useState<RankingMetricType>("criadas");
  const [showComparecimento, setShowComparecimento] = useState(false);
  const [teamFilter, setTeamFilter] = useState<SdrTeamFilterValue>("all");

  // Range único derivado do seletor global de datas; fallback = currentDate.
  const activeRange = useMemo(() => {
    const from = dateRange?.from ?? currentDate;
    const to = dateRange?.to ?? dateRange?.from ?? currentDate;
    const days = Math.max(1, differenceInCalendarDays(to, from) + 1);
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
      days,
      label: isSameDay(from, to)
        ? format(from, "dd/MM/yyyy")
        : `${format(from, "dd/MM/yyyy")} — ${format(to, "dd/MM/yyyy")}`,
    };
  }, [dateRange, currentDate]);

  const sdrOf = (a: AgendamentoMetric) => a.sdr_responsavel_id ?? a.created_by;

  const brDateFmt = useMemo(
    () => new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    [],
  );
  const localDateOf = (iso: string): string => brDateFmt.format(new Date(iso));

  const countFor = (sdrId: string, range: { from: string; to: string }) => {
    if (metricType === "criadas") {
      return createdAgs.filter(a => {
        if (sdrOf(a) !== sdrId) return false;
        if (a.original_agendamento_id) return false;
        const d = localDateOf(a.created_at);
        return d >= range.from && d <= range.to;
      }).length;
    }
    if (metricType === "para") {
      return agendamentos.filter(a =>
        sdrOf(a) === sdrId &&
        a.scheduled_date >= range.from &&
        a.scheduled_date <= range.to
      ).length;
    }
    return agendamentos.filter(a =>
      sdrOf(a) === sdrId &&
      a.status === "realizada" &&
      a.scheduled_date >= range.from &&
      a.scheduled_date <= range.to
    ).length;
  };

  const comparecimentoFor = (sdrId: string) => {
    let para = 0;
    let realizadas = 0;
    agendamentos.forEach(a => {
      if (sdrOf(a) !== sdrId) return;
      if (a.scheduled_date < activeRange.from || a.scheduled_date > activeRange.to) return;
      para += 1;
      if (a.status === "realizada") realizadas += 1;
    });
    const taxa = para > 0 ? (realizadas / para) * 100 : 0;
    return { realizadas, para, taxa };
  };

  const ranking = useMemo(() => {
    return sdrProfiles
      .filter(p => teamFilter === "all" ? true : p.sdr_team === teamFilter)
      .map(profile => {
        const total = countFor(profile.user_id, activeRange);
        const comp = showComparecimento ? comparecimentoFor(profile.user_id) : { realizadas: 0, para: 0, taxa: 0 };
        return { ...profile, total, comp };
      })
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdrProfiles, createdAgs, agendamentos, metricType, activeRange, showComparecimento, teamFilter]);

  const getPosition = (index: number, total: number) => {
    if (total === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
          Sem atividade
        </span>
      );
    }
    const pos = index + 1;
    const emoji = pos === 1 ? "🏆" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "";
    const colors = pos === 1
      ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
      : pos === 2
        ? "border-slate-400/40 bg-slate-400/10 text-slate-300"
        : pos === 3
          ? "border-amber-600/40 bg-amber-600/10 text-amber-500"
          : "border-primary/20 bg-card text-muted-foreground";
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", colors)}>
        {emoji} {pos}º lugar
      </span>
    );
  };

  const metricLabel = METRIC_OPTIONS.find(m => m.key === metricType)?.label ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Trophy className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">Ranking de Performance — SDRs</h2>
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>

      {/* Metric type selector (mutually exclusive) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Métrica:</span>
        {METRIC_OPTIONS.map(opt => (
          <Button
            key={opt.key}
            variant={metricType === opt.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMetricType(opt.key)}
            title={opt.description}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Comparecimento toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Comparecimento:</span>
        <Button
          variant={showComparecimento ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setShowComparecimento(v => !v)}
          title="Mostrar realizadas e taxa de comparecimento dos períodos selecionados"
        >
          {showComparecimento ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Realizadas + Taxa
        </Button>
      </div>

      {/* Filtro por time (Tráfego / Social Selling) */}
      <SdrTeamFilter value={teamFilter} onChange={setTeamFilter} />


      <div className="rounded-xl border border-primary/10 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10">
              <th className="text-left py-3 px-4 font-medium text-xs text-muted-foreground italic">#</th>
              <th className="text-left py-3 px-4 font-medium text-xs text-muted-foreground italic">Nome</th>
              <th className="text-center py-3 px-4 font-medium text-xs text-primary font-bold">
                {metricLabel} — {activeRange.label}
              </th>
              <th className="text-center py-3 px-4 font-medium text-xs text-sky-400 font-bold">
                Média/dia ({activeRange.days}d)
              </th>
              {showComparecimento && (
                <>
                  <th className="text-center py-3 px-4 font-medium text-xs text-emerald-500 font-bold">Realizadas</th>
                  <th className="text-center py-3 px-4 font-medium text-xs text-emerald-500 font-bold">Taxa</th>
                </>
              )}
              <th className="text-center py-3 px-4 font-medium text-xs text-muted-foreground italic">Posição</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 && (
              <tr>
                <td colSpan={5 + (showComparecimento ? 2 : 0)} className="text-center text-muted-foreground py-8 text-xs">
                  Nenhum SDR encontrado
                </td>
              </tr>
            )}
            {ranking.map((row, i) => (
              <tr key={row.user_id} className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                <td className="py-3 px-4 font-semibold">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{row.full_name}</span>
                    <SdrTeamBadge team={row.sdr_team} showEmptyState />
                  </div>
                </td>
                <td className="py-3 px-4 text-center font-bold text-primary">
                  {row.total > 0 ? row.total : "—"}
                </td>
                <td className="py-3 px-4 text-center font-bold text-sky-400">
                  {row.total > 0 ? (row.total / activeRange.days).toFixed(1) : "—"}
                </td>
                {showComparecimento && (
                  <>
                    <td className="py-3 px-4 text-center font-bold text-emerald-500">
                      {row.comp.realizadas > 0 ? `${row.comp.realizadas}/${row.comp.para}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-emerald-500">
                      {row.comp.para > 0 ? `${row.comp.taxa.toFixed(0)}%` : "—"}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-center">
                  {getPosition(i, row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// M3: Relógio isolado e memoizado. Re-renderiza só ele mesmo a cada segundo,
// sem disparar reconciliação no componente DashboardComercialPage (1.300 linhas).
// ─────────────────────────────────────────────────────────────────────────────
const LiveClock = memo(function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{format(now, "HH:mm:ss")}</>;
});
