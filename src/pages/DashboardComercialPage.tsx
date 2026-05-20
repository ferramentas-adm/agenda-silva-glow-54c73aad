import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isSameDay, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  Play, Pause, ChevronLeft, ChevronRight, CalendarDays,
  TrendingUp, RefreshCw, Trophy, Users, Wifi, Eye, EyeOff,
  LayoutGrid,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { CalendarContent } from "@/pages/DashboardPage";
import { LeadsDashboardContent } from "@/pages/DashboardLeadsPage";
import VendasTab from "@/components/dashboard/VendasTab";
import ProdutividadeSDRTab from "@/components/dashboard/ProdutividadeSDRTab";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";
import CargaClosersTab from "@/components/dashboard/CargaClosersTab";
import ErrosSDRTab from "@/components/dashboard/ErrosSDRTab";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSlotCounts } from "@/hooks/useSlotCounts";
import { useSlotLimit } from "@/hooks/useSlotLimit";
import { brTodayYMD } from "@/lib/timezone";

type TabKey = "metricas" | "agenda" | "ranking" | "vendas" | "produtividade" | "leads" | "carga" | "erros_sdr";

const TABS: { key: TabKey; label: string; gestorOnly?: boolean }[] = [
  { key: "metricas", label: "Métricas SDRs" },
  { key: "agenda", label: "Agenda Closers" },
  { key: "ranking", label: "Ranking SDRs" },
  { key: "vendas", label: "Vendas" },
  { key: "produtividade", label: "Produtividade SDR" },
  { key: "leads", label: "Formulário Bio" },
  { key: "carga", label: "Follows Closer", gestorOnly: true },
  { key: "erros_sdr", label: "Erros SDR", gestorOnly: true },
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
}

interface SDRProfile {
  user_id: string;
  full_name: string;
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
  const isAdmin = role === "gestor" || role === "moderador";
  const allowedTabs = useMemo(
    () => TABS.filter((t) => !t.gestorOnly || isAdmin),
    [isAdmin],
  );

  const [visibleTabs, setVisibleTabs] = useState<Set<TabKey>>(() => loadVisibleTabs(user?.id));
  const [activeTabKey, setActiveTabKey] = useState<TabKey>("metricas");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
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

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
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

  // Broad fetch: all agendamentos for current month + adjacent days (+ range, se ativo)
  const { data: agendamentos = [], dataUpdatedAt } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-metrics", monthStart, monthEnd, yesterdayStr, tomorrowStr, rangeFromStr, rangeToStr],
    queryFn: async () => {
      let minDate = yesterdayStr < monthStart ? yesterdayStr : monthStart;
      let maxDate = tomorrowStr > monthEnd ? tomorrowStr : monthEnd;
      if (rangeFromStr && rangeFromStr < minDate) minDate = rangeFromStr;
      if (rangeToStr && rangeToStr > maxDate) maxDate = rangeToStr;
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, scheduled_time, created_at, status, channel_type, created_by, sdr_responsavel_id, original_agendamento_id")
        .is("deleted_at", null)
        .gte("scheduled_date", minDate)
        .lte("scheduled_date", maxDate)
        .order("scheduled_date")
        .range(0, 49999);
      return (data ?? []) as AgendamentoMetric[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  // Previous month for comparison
  const { data: prevMonthAgs = [] } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-prev", prevMonthStart, prevMonthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, scheduled_time, created_at, status, channel_type, created_by, sdr_responsavel_id, original_agendamento_id")
        .is("deleted_at", null)
        .gte("scheduled_date", prevMonthStart)
        .lte("scheduled_date", prevMonthEnd)
        .range(0, 49999);
      return (data ?? []) as AgendamentoMetric[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Broad fetch for ranking: all agendamentos created in a wide range (for custom date ranges)
  const { data: createdAgs = [] } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-created", monthStart, monthEnd, rangeFromStr, rangeToStr],
    queryFn: async () => {
      // Fetch a broader range to support custom date filters
      let broadStart = format(subMonths(startOfMonth(currentDate), 2), "yyyy-MM-dd");
      let broadEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");
      if (rangeFromStr && rangeFromStr < broadStart) broadStart = rangeFromStr;
      if (rangeToStr && rangeToStr > broadEnd) broadEnd = rangeToStr;
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, scheduled_time, created_at, status, channel_type, created_by, sdr_responsavel_id, original_agendamento_id")
        .is("deleted_at", null)
        // Janela ampliada em ±1 dia para garantir que registros próximos da
        // virada de dia em BRT (UTC-3) não sejam cortados pelo filtro UTC.
        // O filtro fino por dia BRT é aplicado no cliente via localDateOf.
        .gte("created_at", format(subDays(parseISO(broadStart), 1), "yyyy-MM-dd") + "T00:00:00")
        .lte("created_at", format(addDays(parseISO(broadEnd), 1), "yyyy-MM-dd") + "T23:59:59")
        .order("created_at", { ascending: false })
        .range(0, 49999);
      return (data ?? []) as AgendamentoMetric[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  // SDR profiles
  const { data: sdrProfiles = [] } = useQuery<SDRProfile[]>({
    queryKey: ["sdr-profiles-ranking"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr");
      if (!roles?.length) return [];
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
        .eq("active", true);
      return (profiles ?? []) as SDRProfile[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ─── Computed metrics ──────────────────────────────────────────
  // Regra de negócio: TODAS as métricas deste painel consideram apenas
  // agendamentos criados por usuários com função SDR (mesma regra do
  // painel "Produtividade SDR"). Agendamentos criados por closers/
  // gestores/moderadores via Calendário não entram na contagem.
  const sdrUserIds = useMemo(
    () => new Set(sdrProfiles.map(p => p.user_id)),
    [sdrProfiles],
  );

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

    // Pool base: somente agendamentos criados por SDRs.
    const sdrAgs = agendamentos.filter(
      a => a.created_by && sdrUserIds.has(a.created_by),
    );
    // Para "Geradas/Criadas" usamos o pool fetched por created_at (createdAgs)
    // — assim incluímos reuniões criadas hoje mesmo que agendadas para fora
    // do range mensal (o pool `agendamentos` é filtrado por scheduled_date).
    // Isto garante paridade exata com o painel "Produtividade SDR".
    // Exclui reagendamentos (que têm original_agendamento_id) — só conta agendas novas.
    const sdrCreatedAgs = createdAgs.filter(
      a => a.created_by && sdrUserIds.has(a.created_by) && !a.original_agendamento_id,
    );

    // Quando há intervalo ativo, "todayAgs"/"todayCreated" passam a ser
    // a soma agregada de todo o período selecionado. Caso contrário, mantém
    // o comportamento de dia único (currentDate).
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

    const byChannel = (list: AgendamentoMetric[]) => {
      const map = new Map<string, string[]>();
      list.forEach(a => {
        const ch = a.channel_type || "Sem canal";
        const arr = map.get(ch) || [];
        arr.push(a.id);
        map.set(ch, arr);
      });
      return Array.from(map.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([canal, ids], i) => ({ num: i + 1, canal, qtd: ids.length, ids }));
    };

    const noShowCount = sc(todayAgs, "no_show");
    const canceladoCount = sc(todayAgs, "cancelada");
    const reagendadoCount = sc(todayAgs, "reagendada");
    const compareceuCount = sc(todayAgs, "realizada");
    const totalDia = todayAgs.length;
    // Taxa de Comparecimento = realizadas / total de agendamentos do período
    const taxaComp = totalDia > 0
      ? (compareceuCount / totalDia) * 100
      : 0;

    return {
      todayScheduled: todayAgs.length,
      todayCreated: todayCreated.length,
      yesterdayScheduled: yesterdayAgs.length,
      tomorrowScheduled: tomorrowAgs.length,
      monthTotal: monthAgs.length,
      monthDiff: monthAgs.length - prevMonthAgs.filter(a => a.created_by && sdrUserIds.has(a.created_by)).length,
      confirmado: sc(todayAgs, "confirmada"),
      agendado: sc(todayAgs, "agendada"),
      compareceu: sc(todayAgs, "realizada"),
      noShow: noShowCount,
      cancelado: canceladoCount,
      reagendado: reagendadoCount,
      taxaComp,
      totalDia,
      channelsToday: byChannel(todayAgs),
      channelsCreatedToday: byChannel(todayCreated),
      // IDs para drill-down
      todayScheduledIds: todayAgs.map(a => a.id),
      todayCreatedIds: todayCreated.map(a => a.id),
      yesterdayScheduledIds: yesterdayAgs.map(a => a.id),
      tomorrowScheduledIds: tomorrowAgs.map(a => a.id),
      monthTotalIds: monthAgs.map(a => a.id),
      confirmadoIds: todayAgs.filter(a => a.status === "confirmada").map(a => a.id),
      agendadoIds: todayAgs.filter(a => a.status === "agendada").map(a => a.id),
      compareceuIds: todayAgs.filter(a => a.status === "realizada").map(a => a.id),
      noShowIds: todayAgs.filter(a => a.status === "no_show").map(a => a.id),
      canceladoIds: todayAgs.filter(a => a.status === "cancelada").map(a => a.id),
      reagendadoIds: todayAgs.filter(a => a.status === "reagendada").map(a => a.id),
    };
  }, [agendamentos, createdAgs, prevMonthAgs, dateStr, yesterdayStr, tomorrowStr, monthStart, monthEnd, sdrUserIds, isRangeActive, rangeFromStr, rangeToStr]);

  // ─── Ranking is now computed inside RankingSDRsTab from raw data ──

  const updatedAgo = useMemo(() => {
    if (!dataUpdatedAt) return "";
    const diff = Math.floor((Date.now() - dataUpdatedAt) / 60000);
    if (diff < 1) return "Atualizado agora";
    return `Atualizado há ${diff} minuto${diff > 1 ? "s" : ""}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, clock]);

  const goPrev = () => { setDateRange(undefined); setCurrentDate(d => subDays(d, 1)); };
  const goNext = () => { setDateRange(undefined); setCurrentDate(d => addDays(d, 1)); };
  const goToday = () => { setDateRange(undefined); setCurrentDate(new Date()); };

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

          {/* Clock + Online */}
          <div className="ml-auto flex items-center gap-4">
            <span className="text-lg font-mono font-bold tracking-tight">
              {format(clock, "HH:mm:ss")}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Wifi className="h-3.5 w-3.5" />
              Online
            </span>
          </div>
        </div>

        {/* ─── Date nav (oculta na aba Agenda Closers) ──── */}
        {activeTabKey !== "agenda" && activeTabKey !== "leads" && activeTabKey !== "carga" && (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to)
                ? `Calendário — ${format(dateRange.from, "dd/MM/yyyy")} a ${format(dateRange.to, "dd/MM/yyyy")}`
                : format(currentDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
                  ? "Calendário"
                  : `Calendário — ${format(currentDate, "dd/MM/yyyy")}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to)
                ? `Intervalo de ${format(dateRange.from, "dd/MM", { locale: ptBR })} até ${format(dateRange.to, "dd/MM", { locale: ptBR })}`
                : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={!!(dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium min-w-[100px] text-center">
                {dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to)
                  ? `${format(dateRange.from, "dd/MM")} – ${format(dateRange.to, "dd/MM")}`
                  : format(currentDate, "dd/MM/yyyy")}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={!!(dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs ml-1" onClick={goToday}>
                Hoje
              </Button>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 ml-1">
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange ?? { from: currentDate, to: currentDate }}
                    onSelect={(r) => {
                      setDateRange(r);
                      if (r?.from && !r.to) {
                        setCurrentDate(r.from);
                      } else if (r?.from && r?.to) {
                        setCurrentDate(r.from);
                        if (isSameDay(r.from, r.to)) {
                          setDateRange(undefined);
                        }
                        setCalendarOpen(false);
                      }
                    }}
                    locale={ptBR}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                  {dateRange?.from && (
                    <div className="flex justify-end p-2 border-t">
                      <Button variant="ghost" size="sm" onClick={() => { setDateRange(undefined); setCalendarOpen(false); }}>
                        Limpar intervalo
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
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
          />
        )}
        {activeTabKey === "vendas" && <VendasTab currentDate={currentDate} dateRange={dateRange} />}
        {activeTabKey === "produtividade" && (
          <ProdutividadeSDRTab
            agendamentos={agendamentos}
            createdAgs={createdAgs}
            sdrProfiles={sdrProfiles}
            currentDate={currentDate}
            updatedAgo={updatedAgo}
          />
        )}
        {activeTabKey === "leads" && <LeadsDashboardContent />}
        {activeTabKey === "carga" && isAdmin && <CargaClosersTab />}
        {activeTabKey === "erros_sdr" && isAdmin && (
          <ErrosSDRTab currentDate={currentDate} dateRange={isRangeActive ? dateRange : undefined} />
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
}: {
  title: string;
  value: number | string;
  subtitle: React.ReactNode;
  highlight?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
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
    if (!counts) return [] as { time: string; count: number }[];
    return Array.from(counts.entries())
      .filter(([, n]) => n >= limit)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [counts, limit]);

  const nearlyFull = useMemo(() => {
    if (!counts) return [] as { time: string; count: number }[];
    return Array.from(counts.entries())
      .filter(([, n]) => n >= Math.max(1, limit - 2) && n < limit)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [counts, limit]);

  if (fullSlots.length === 0 && nearlyFull.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-red-500">
          Horários cheios hoje (limite {limit}/horário)
        </div>
        <div className="text-xs text-muted-foreground">
          SDR não consegue mais agendar nos horários lotados.
        </div>
      </div>
      {fullSlots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fullSlots.map((s) => (
            <span key={s.time} className="inline-flex items-center gap-1 rounded-full bg-red-500 text-white px-2.5 py-0.5 text-xs font-bold">
              {s.time} · {s.count}/{limit}
            </span>
          ))}
        </div>
      )}
      {nearlyFull.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quase lotados:</span>
          {nearlyFull.map((s) => (
            <span key={s.time} className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-semibold">
              {s.time} · {s.count}/{limit}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Channel Table ───────────────────────────────────────────────
function ChannelTable({
  title,
  data,
  onRowClick,
}: {
  title: string;
  data: { num: number; canal: string; qtd: number; ids: string[] }[];
  onRowClick?: (row: { canal: string; ids: string[] }) => void;
}) {
  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-muted-foreground">
              <th className="text-left py-2 px-2 font-medium text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-xs">Canal</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Qtd</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum registro
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={row.canal}
                className={cn(
                  "border-b border-primary/5",
                  onRowClick && "cursor-pointer hover:bg-primary/5 transition-colors"
                )}
                onClick={onRowClick ? () => onRowClick({ canal: row.canal, ids: row.ids }) : undefined}
              >
                <td className="py-2 px-2 text-muted-foreground">{row.num}</td>
                <td className="py-2 px-2 font-medium">{row.canal}</td>
                <td className="py-2 px-2 text-right font-bold">{row.qtd}</td>
              </tr>
            ))}
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
        <MetricCard title={titleGeradas} value={metrics.todayCreated} subtitle={subtitleSelected} onClick={() => openDrill(titleGeradas, metrics.todayCreatedIds)} />
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
        <MetricCard title={`Reagendado — ${selectedLabel}`} value={metrics.reagendado} subtitle={subtitleSelected} onClick={() => openDrill(`Reagendado — ${selectedLabel}`, metrics.reagendadoIds)} />
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
          onRowClick={({ canal, ids }) => openDrill(`${isRange ? `Agendas Para ${rangeLabel}` : getChannelTableLabel(currentDate, "para").replace(" — por Canal", "")} — ${canal}`, ids)}
        />
        <ChannelTable
          title={isRange ? `Agendas Criadas ${rangeLabel} — por Canal` : getChannelTableLabel(currentDate, "criadas")}
          data={metrics.channelsCreatedToday}
          onRowClick={({ canal, ids }) => openDrill(`${isRange ? `Agendas Criadas ${rangeLabel}` : getChannelTableLabel(currentDate, "criadas").replace(" — por Canal", "")} — ${canal}`, ids)}
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
}: {
  sdrProfiles: SDRProfile[];
  updatedAgo: string;
  createdAgs: AgendamentoMetric[];
  agendamentos: AgendamentoMetric[];
  currentDate: Date;
}) {
  const [metricType, setMetricType] = useState<RankingMetricType>("criadas");
  const [visiblePeriods, setVisiblePeriods] = useState<Set<RankingPeriodKey>>(new Set(["hoje", "semana", "mes"]));
  const [specificDate, setSpecificDate] = useState<Date | undefined>(undefined);
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [dateOpen, setDateOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  const togglePeriod = (key: RankingPeriodKey) => {
    setVisiblePeriods(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const periodRanges = useMemo(() => {
    const dateStr = format(currentDate, "yyyy-MM-dd");
    const yesterdayStr = format(subDays(currentDate, 1), "yyyy-MM-dd");
    const tomorrowStr = format(addDays(currentDate, 1), "yyyy-MM-dd");
    const weekStart = format(startOfWeek(currentDate, { locale: ptBR }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(currentDate, { locale: ptBR }), "yyyy-MM-dd");
    const quinzenaStart = format(subDays(currentDate, 14), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");

    const map: Record<RankingPeriodKey, { from: string; to: string } | null> = {
      hoje: { from: dateStr, to: dateStr },
      ontem: { from: yesterdayStr, to: yesterdayStr },
      amanha: { from: tomorrowStr, to: tomorrowStr },
      semana: { from: weekStart, to: weekEnd },
      quinzena: { from: quinzenaStart, to: dateStr },
      mes: { from: monthStart, to: monthEnd },
      data: specificDate
        ? { from: format(specificDate, "yyyy-MM-dd"), to: format(specificDate, "yyyy-MM-dd") }
        : null,
      intervalo: customRange.from && customRange.to
        ? { from: format(customRange.from, "yyyy-MM-dd"), to: format(customRange.to, "yyyy-MM-dd") }
        : null,
    };
    return map;
  }, [currentDate, specificDate, customRange]);

  const sdrOf = (a: AgendamentoMetric) => a.sdr_responsavel_id ?? a.created_by;

  // Normaliza created_at (UTC) para a data local em America/Sao_Paulo,
  // evitando que reuniões criadas após 21h BRT sejam contabilizadas no
  // dia seguinte por causa da conversão para UTC.
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

  const countFor = (sdrId: string, range: { from: string; to: string } | null) => {
    if (!range) return 0;
    if (metricType === "criadas") {
      return createdAgs.filter(a => {
        if (sdrOf(a) !== sdrId) return false;
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

  const activePeriods = PERIOD_OPTIONS.filter(p => visiblePeriods.has(p.key));

  const ranking = useMemo(() => {
    return sdrProfiles
      .map(profile => {
        const counts: Record<string, number> = {};
        let total = 0;
        activePeriods.forEach(p => {
          const v = countFor(profile.user_id, periodRanges[p.key]);
          counts[p.key] = v;
          total += v;
        });
        return { ...profile, counts, total };
      })
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdrProfiles, createdAgs, agendamentos, metricType, periodRanges, visiblePeriods]);

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

  const periodColumnLabel = (p: { key: RankingPeriodKey; label: string }) => {
    if (p.key === "data" && specificDate) return format(specificDate, "dd/MM/yyyy");
    if (p.key === "intervalo" && customRange.from && customRange.to) {
      return `${format(customRange.from, "dd/MM")} — ${format(customRange.to, "dd/MM")}`;
    }
    return p.label;
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

      {/* Period toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Períodos:</span>
        {PERIOD_OPTIONS.map(p => (
          <Button
            key={p.key}
            variant={visiblePeriods.has(p.key) ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => togglePeriod(p.key)}
          >
            {visiblePeriods.has(p.key) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {p.label}
          </Button>
        ))}
      </div>

      {/* Specific date picker */}
      {visiblePeriods.has("data") && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Data específica:</span>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <CalendarDays className="h-3 w-3" />
                {specificDate ? format(specificDate, "dd/MM/yyyy") : "Selecionar data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={specificDate}
                onSelect={(date) => { setSpecificDate(date); setDateOpen(false); }}
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Custom range picker */}
      {visiblePeriods.has("intervalo") && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Intervalo:</span>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <CalendarDays className="h-3 w-3" />
                {customRange.from && customRange.to
                  ? `${format(customRange.from, "dd/MM/yyyy")} — ${format(customRange.to, "dd/MM/yyyy")}`
                  : "Selecionar intervalo"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
                onSelect={(range) => {
                  if (customRange.from && customRange.to) {
                    setCustomRange({ from: range?.to || range?.from, to: undefined });
                  } else if (customRange.from && !customRange.to && range?.to) {
                    setCustomRange({ from: range.from, to: range.to });
                    setRangeOpen(false);
                  } else {
                    setCustomRange({ from: range?.from, to: undefined });
                  }
                }}
                locale={ptBR}
                numberOfMonths={2}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="rounded-xl border border-primary/10 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10">
              <th className="text-left py-3 px-4 font-medium text-xs text-muted-foreground italic">#</th>
              <th className="text-left py-3 px-4 font-medium text-xs text-muted-foreground italic">Nome</th>
              {activePeriods.map(p => (
                <th key={p.key} className="text-center py-3 px-4 font-medium text-xs text-primary font-bold">
                  {metricLabel} — {periodColumnLabel(p)}
                </th>
              ))}
              <th className="text-center py-3 px-4 font-medium text-xs text-muted-foreground italic">Posição</th>
            </tr>
          </thead>
          <tbody>
            {(ranking.length === 0 || activePeriods.length === 0) && (
              <tr>
                <td colSpan={3 + activePeriods.length} className="text-center text-muted-foreground py-8 text-xs">
                  {activePeriods.length === 0 ? "Selecione ao menos um período" : "Nenhum SDR encontrado"}
                </td>
              </tr>
            )}
            {activePeriods.length > 0 && ranking.map((row, i) => (
              <tr key={row.user_id} className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                <td className="py-3 px-4 font-semibold">{row.full_name}</td>
                {activePeriods.map(p => {
                  const val = row.counts[p.key] ?? 0;
                  return (
                    <td key={p.key} className="py-3 px-4 text-center font-bold text-primary">
                      {val > 0 ? val : "—"}
                    </td>
                  );
                })}
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
