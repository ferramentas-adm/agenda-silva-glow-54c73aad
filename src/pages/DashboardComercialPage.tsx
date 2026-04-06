import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Play, Pause, ChevronLeft, ChevronRight, CalendarDays,
  TrendingUp, RefreshCw, Trophy, Users, Wifi, Eye, EyeOff,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { CalendarContent } from "@/pages/DashboardPage";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const TAB_NAMES = ["Métricas SDRs", "Agenda Closers", "Ranking SDRs"];
const ROTATION_INTERVAL = 30000;

interface AgendamentoMetric {
  id: string;
  scheduled_date: string;
  created_at: string;
  status: string;
  channel_type: string | null;
  created_by: string | null;
}

interface SDRProfile {
  user_id: string;
  full_name: string;
}

// ─── Main Page ───────────────────────────────────────────────────
export default function DashboardComercialPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [clock, setClock] = useState(new Date());

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-rotation
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveTab(prev => (prev + 1) % TAB_NAMES.length);
    }, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const dateStr = format(currentDate, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(currentDate, 1), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(currentDate, 1), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(subMonths(currentDate, 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(currentDate, 1)), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(currentDate, { locale: ptBR }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(currentDate, { locale: ptBR }), "yyyy-MM-dd");

  // Broad fetch: all agendamentos for current month + adjacent days
  const { data: agendamentos = [], dataUpdatedAt } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-metrics", monthStart, monthEnd, yesterdayStr, tomorrowStr],
    queryFn: async () => {
      const minDate = yesterdayStr < monthStart ? yesterdayStr : monthStart;
      const maxDate = tomorrowStr > monthEnd ? tomorrowStr : monthEnd;
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, created_at, status, channel_type, created_by")
        .is("deleted_at", null)
        .gte("scheduled_date", minDate)
        .lte("scheduled_date", maxDate)
        .order("scheduled_date");
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
        .select("id, scheduled_date, created_at, status, channel_type, created_by")
        .is("deleted_at", null)
        .gte("scheduled_date", prevMonthStart)
        .lte("scheduled_date", prevMonthEnd);
      return (data ?? []) as AgendamentoMetric[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Broad fetch for ranking: all agendamentos created in a wide range (for custom date ranges)
  const { data: createdAgs = [] } = useQuery<AgendamentoMetric[]>({
    queryKey: ["dashboard-comercial-created", monthStart, monthEnd],
    queryFn: async () => {
      // Fetch a broader range to support custom date filters
      const broadStart = format(subMonths(startOfMonth(currentDate), 2), "yyyy-MM-dd");
      const broadEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, created_at, status, channel_type, created_by")
        .is("deleted_at", null)
        .gte("created_at", broadStart + "T00:00:00")
        .lte("created_at", broadEnd + "T23:59:59");
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
  const metrics = useMemo(() => {
    const todayAgs = agendamentos.filter(a => a.scheduled_date === dateStr);
    const todayCreated = agendamentos.filter(a => a.created_at.startsWith(dateStr));
    const yesterdayAgs = agendamentos.filter(a => a.scheduled_date === yesterdayStr);
    const tomorrowAgs = agendamentos.filter(a => a.scheduled_date === tomorrowStr);
    const monthAgs = agendamentos.filter(a => a.scheduled_date >= monthStart && a.scheduled_date <= monthEnd);

    const sc = (list: AgendamentoMetric[], s: string) => list.filter(a => a.status === s).length;

    const byChannel = (list: AgendamentoMetric[]) => {
      const map = new Map<string, number>();
      list.forEach(a => {
        const ch = a.channel_type || "Sem canal";
        map.set(ch, (map.get(ch) || 0) + 1);
      });
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([canal, qtd], i) => ({ num: i + 1, canal, qtd }));
    };

    return {
      todayScheduled: todayAgs.length,
      todayCreated: todayCreated.length,
      yesterdayScheduled: yesterdayAgs.length,
      tomorrowScheduled: tomorrowAgs.length,
      monthTotal: monthAgs.length,
      monthDiff: monthAgs.length - prevMonthAgs.length,
      confirmado: sc(todayAgs, "confirmada"),
      compareceu: sc(todayAgs, "realizada"),
      noShow: sc(todayAgs, "no_show"),
      cancelado: sc(todayAgs, "cancelada"),
      channelsToday: byChannel(todayAgs),
      channelsCreatedToday: byChannel(todayCreated),
    };
  }, [agendamentos, prevMonthAgs, dateStr, yesterdayStr, tomorrowStr, monthStart, monthEnd]);

  // ─── Ranking ───────────────────────────────────────────────────
  const ranking = useMemo(() => {
    const yesterdayStart = format(subDays(currentDate, 1), "yyyy-MM-dd");
    const quinzenaStart = format(subDays(currentDate, 14), "yyyy-MM-dd");

    return sdrProfiles.map(profile => {
      const countInRange = (start: string, end: string) =>
        createdAgs.filter(a =>
          a.created_by === profile.user_id &&
          a.created_at >= start + "T00:00:00" &&
          a.created_at <= end + "T23:59:59"
        ).length;

      const hoje = countInRange(dateStr, dateStr);
      const paraHoje = agendamentos.filter(a =>
        a.created_by === profile.user_id &&
        a.scheduled_date === dateStr
      ).length;
      const ontem = countInRange(yesterdayStart, yesterdayStart);
      const semana = countInRange(weekStart, weekEnd);
      const quinzena = countInRange(quinzenaStart, dateStr);
      const mes = createdAgs.filter(a =>
        a.created_by === profile.user_id &&
        a.created_at >= monthStart + "T00:00:00" &&
        a.created_at <= monthEnd + "T23:59:59"
      ).length;

      return { ...profile, hoje, paraHoje, ontem, semana, quinzena, mes };
    }).sort((a, b) => b.hoje - a.hoje || b.semana - a.semana || b.mes - a.mes);
  }, [sdrProfiles, createdAgs, agendamentos, dateStr, weekStart, weekEnd, monthStart, monthEnd, currentDate]);

  const updatedAgo = useMemo(() => {
    if (!dataUpdatedAt) return "";
    const diff = Math.floor((Date.now() - dataUpdatedAt) / 60000);
    if (diff < 1) return "Atualizado agora";
    return `Atualizado há ${diff} minuto${diff > 1 ? "s" : ""}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, clock]);

  const goPrev = () => setCurrentDate(d => subDays(d, 1));
  const goNext = () => setCurrentDate(d => addDays(d, 1));
  const goToday = () => setCurrentDate(new Date());

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
            {TAB_NAMES.map((name, i) => (
              <Button
                key={name}
                variant={activeTab === i ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs",
                  activeTab === i && "bg-primary text-primary-foreground"
                )}
                onClick={() => { setActiveTab(i); setIsPlaying(false); }}
              >
                {name}
              </Button>
            ))}
          </div>

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

        {/* ─── Date nav (Métricas & Ranking tabs only) ──── */}
        {activeTab !== 1 && (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
            <p className="text-sm text-muted-foreground">
              {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium min-w-[100px] text-center">
                {format(currentDate, "dd/MM/yyyy")}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
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
                    mode="single"
                    selected={currentDate}
                    onSelect={(date) => { if (date) { setCurrentDate(date); setCalendarOpen(false); } }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={handleRefresh} title="Atualizar dados">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Tab content ────────────────────────────────── */}
        {activeTab === 0 && (
          <MetricasSDRsTab
            metrics={metrics}
            currentDate={currentDate}
            updatedAgo={updatedAgo}
          />
        )}
        {activeTab === 1 && <CalendarContent />}
        {activeTab === 2 && (
          <RankingSDRsTab
            ranking={ranking}
            updatedAgo={updatedAgo}
            createdAgs={createdAgs}
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
}: {
  title: string;
  value: number;
  subtitle: React.ReactNode;
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-2 transition-all",
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
    </div>
  );
}

// ─── Channel Table ───────────────────────────────────────────────
function ChannelTable({
  title,
  data,
}: {
  title: string;
  data: { num: number; canal: string; qtd: number }[];
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
              <tr key={row.canal} className="border-b border-primary/5">
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

// ─── Métricas SDRs Tab ──────────────────────────────────────────
function MetricasSDRsTab({
  metrics,
  currentDate,
  updatedAgo,
}: {
  metrics: ReturnType<any>;
  currentDate: Date;
  updatedAgo: string;
}) {
  const dateLabel = format(currentDate, "dd/MM/yyyy");
  const yesterdayLabel = format(subDays(currentDate, 1), "dd/MM/yyyy");
  const tomorrowLabel = format(addDays(currentDate, 1), "dd/MM/yyyy");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">Métricas de Agendamentos</h2>
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard title="Agendas Para Hoje" value={metrics.todayScheduled} subtitle={dateLabel} highlight />
        <MetricCard title="Agendas Geradas Hoje" value={metrics.todayCreated} subtitle={dateLabel} />
        <MetricCard title="Agendas De Ontem" value={metrics.yesterdayScheduled} subtitle={yesterdayLabel} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard title="Agendas Para Amanhã" value={metrics.tomorrowScheduled} subtitle={tomorrowLabel} />
        <MetricCard
          title="Total Mês"
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
        />
        <MetricCard title="Confirmado" value={metrics.confirmado} subtitle="Hoje" />
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard title="Compareceu" value={metrics.compareceu} subtitle="Hoje" />
        <MetricCard title="No-show" value={metrics.noShow} subtitle="Hoje" />
        <MetricCard title="Cancelado" value={metrics.cancelado} subtitle="Hoje" />
      </div>

      {/* Channel tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChannelTable title="Agendas Para Hoje — por Canal" data={metrics.channelsToday} />
        <ChannelTable title="Agendas Criadas Hoje — por Canal" data={metrics.channelsCreatedToday} />
      </div>
    </div>
  );
}

// ─── Ranking SDRs Tab ────────────────────────────────────────────
type RankingColumnKey = "ontem" | "semana" | "quinzena" | "mes" | "personalizado";

const RANKING_COLUMNS: { key: RankingColumnKey; label: string }[] = [
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Semana" },
  { key: "quinzena", label: "Quinzena" },
  { key: "mes", label: "Mês" },
  { key: "personalizado", label: "Personalizado" },
];

function RankingSDRsTab({
  ranking,
  updatedAgo,
  createdAgs,
}: {
  ranking: { user_id: string; full_name: string; hoje: number; paraHoje: number; ontem: number; semana: number; quinzena: number; mes: number }[];
  updatedAgo: string;
  createdAgs: AgendamentoMetric[];
}) {
  const [visibleCols, setVisibleCols] = useState<Set<RankingColumnKey>>(new Set(["semana", "mes"]));
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [rangeOpen, setRangeOpen] = useState(false);

  const toggleCol = (key: RankingColumnKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Custom range counts
  const customCounts = useMemo(() => {
    if (!customRange.from || !customRange.to) return new Map<string, number>();
    const start = format(customRange.from, "yyyy-MM-dd");
    const end = format(customRange.to, "yyyy-MM-dd");
    const map = new Map<string, number>();
    createdAgs.forEach(a => {
      if (a.created_by && a.created_at >= start + "T00:00:00" && a.created_at <= end + "T23:59:59") {
        map.set(a.created_by, (map.get(a.created_by) || 0) + 1);
      }
    });
    return map;
  }, [createdAgs, customRange]);

  const getPosition = (index: number, row: typeof ranking[0]) => {
    if (row.hoje === 0 && row.semana === 0 && row.mes === 0) {
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

  const activeNonFixedCols = RANKING_COLUMNS.filter(c => visibleCols.has(c.key));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Trophy className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">Ranking de Performance — SDRs</h2>
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>

      {/* Column toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Colunas:</span>
        {RANKING_COLUMNS.map(col => (
          <Button
            key={col.key}
            variant={visibleCols.has(col.key) ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => toggleCol(col.key)}
          >
            {visibleCols.has(col.key) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {col.label}
          </Button>
        ))}
      </div>

      {/* Custom date range picker */}
      {visibleCols.has("personalizado") && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Período personalizado:</span>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <CalendarDays className="h-3 w-3" />
                {customRange.from && customRange.to
                  ? `${format(customRange.from, "dd/MM/yyyy")} — ${format(customRange.to, "dd/MM/yyyy")}`
                  : "Selecionar período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
                onSelect={(range) => {
                  // If user already has a complete range or no range, start fresh with new "from"
                  if (customRange.from && customRange.to) {
                    // Had a complete range, so this click starts a new one
                    setCustomRange({ from: range?.to || range?.from, to: undefined });
                  } else if (customRange.from && !customRange.to && range?.to) {
                    // Had only "from", now got "to" — complete the range
                    setCustomRange({ from: range.from, to: range.to });
                    setRangeOpen(false);
                  } else {
                    // First click — set "from"
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
              <th className="text-center py-3 px-4 font-medium text-xs text-primary font-bold">Criadas Hoje</th>
              <th className="text-center py-3 px-4 font-medium text-xs text-primary font-bold">Para Hoje</th>
              {activeNonFixedCols.map(col => (
                <th key={col.key} className="text-center py-3 px-4 font-medium text-xs text-muted-foreground">
                  {col.key === "personalizado" && customRange.from && customRange.to
                    ? `${format(customRange.from, "dd/MM")} — ${format(customRange.to, "dd/MM")}`
                    : col.label}
                </th>
              ))}
              <th className="text-center py-3 px-4 font-medium text-xs text-muted-foreground italic">Posição</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 && (
              <tr>
                <td colSpan={4 + activeNonFixedCols.length + 1} className="text-center text-muted-foreground py-8 text-xs">
                  Nenhum SDR encontrado
                </td>
              </tr>
            )}
            {ranking.map((row, i) => (
              <tr key={row.user_id} className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                <td className="py-3 px-4 font-semibold">{row.full_name}</td>
                <td className="py-3 px-4 text-center font-bold text-primary">
                  {row.hoje > 0 ? row.hoje : "—"}
                </td>
                <td className="py-3 px-4 text-center font-bold text-primary">
                  {row.paraHoje > 0 ? row.paraHoje : "—"}
                </td>
                {activeNonFixedCols.map(col => {
                  let val = 0;
                  if (col.key === "personalizado") {
                    val = customCounts.get(row.user_id) || 0;
                  } else {
                    val = row[col.key as keyof typeof row] as number;
                  }
                  return (
                    <td key={col.key} className="py-3 px-4 text-center">
                      {val > 0 ? val : "—"}
                    </td>
                  );
                })}
                <td className="py-3 px-4 text-center">
                  {getPosition(i, row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
