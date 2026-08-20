import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { format, subDays, addDays, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3,
  Sun,
  Sunset,
  Moon,
  MoonStar,
  Users,
  CalendarDays,
  CheckCircle2,
  XCircle,
  CalendarClock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import TrendCardSDR from "@/components/dashboard/TrendCardSDR";
import ProdutividadePorHoraCard from "@/components/dashboard/ProdutividadePorHoraCard";

import CriadasPorDiaDialog, { type CriadasDayGroup } from "@/components/dashboard/CriadasPorDiaDialog";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";
import { SdrTeamBadge, type SdrTeam } from "@/components/sdr/SdrTeamBadge";
import { SdrTeamFilter, type SdrTeamFilterValue } from "@/components/sdr/SdrTeamFilter";

interface AgendamentoMetric {
  id: string;
  scheduled_date: string;
  scheduled_time?: string | null;
  created_at: string;
  status: string;
  channel_type: string | null;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  original_agendamento_id?: string | null;
}

/**
 * Status efetivo — mantido por compatibilidade. Reagendamentos novos hoje entram
 * como 'agendada' e passam pelo fluxo de confirmação, então retorna o status real.
 */
function getEffectiveStatus(a: { status: string; original_agendamento_id?: string | null }): string {
  return a.status;
}

interface SDRProfile {
  user_id: string;
  full_name: string;
  sdr_team?: SdrTeam | null;
}

type FilterType = "criadas" | "para" | "compareceu" | "nao_compareceu";

const FILTER_OPTIONS: { key: FilterType; label: string; icon: typeof CalendarDays; color: string }[] = [
  { key: "criadas", label: "Criadas", icon: CalendarDays, color: "text-primary" },
  { key: "para", label: "Para", icon: CalendarClock, color: "text-sky-500" },
  { key: "compareceu", label: "Compareceu", icon: CheckCircle2, color: "text-emerald-500" },
  { key: "nao_compareceu", label: "Não compareceu", icon: XCircle, color: "text-destructive" },
];

interface Props {
  /** Conjunto amplo de agendamentos já carregados pela página pai. */
  agendamentos: AgendamentoMetric[];
  /** Conjunto amplo de agendamentos filtrados por created_at. */
  createdAgs: AgendamentoMetric[];
  sdrProfiles: SDRProfile[];
  currentDate: Date;
  /** Intervalo vindo do filtro de data único no topo da página. */
  dateRange?: { from?: Date; to?: Date };
  updatedAgo: string;
}

/** Extrai a hora ("HH:mm" ou ISO) e devolve o número 0-23. */
function getHourFromTime(time?: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (m) return Number(m[1]);
  return null;
}

/** Classifica em madrugada/manhã/tarde/noite. */
function getShift(hour: number | null): "madrugada" | "manha" | "tarde" | "noite" | "outros" {
  if (hour === null) return "outros";
  if (hour >= 0 && hour < 6) return "madrugada";
  if (hour >= 6 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  if (hour >= 18 && hour < 24) return "noite";
  return "outros";
}

/**
 * Devolve o YYYY-MM-DD correspondente ao timestamp ISO no fuso LOCAL do
 * navegador. Usamos isso para garantir que filtros por data e a classificação
 * por turno (manhã/tarde/noite) usem a mesma referência temporal — caso
 * contrário um agendamento criado às 21h BRT (00h UTC do dia seguinte) seria
 * filtrado como "hoje" via UTC mas classificado como "noite de ontem" via
 * hora local.
 */
const BR_TZ = "America/Sao_Paulo";
const brDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function localDateOf(iso: string): string {
  // Sempre no fuso de operação (BRT). Evita que o timezone do navegador
  // do gestor (UTC, Europa, etc.) faça uma agenda criada às 21h BRT
  // aparecer como "amanhã".
  return brDateFmt.format(new Date(iso));
}

export default function ProdutividadeSDRTab({
  agendamentos,
  createdAgs,
  sdrProfiles,
  currentDate,
  dateRange,
  updatedAgo,
}: Props) {
  const { role } = useAuth();
  const isManager = role === "gestor" || (role === "moderador" || role === "apresentador") || role === "supervisor";
  const [filter, setFilter] = useState<FilterType>("criadas");
  const [teamFilter, setTeamFilter] = useState<SdrTeamFilterValue>("all");
  const [criadasDiasOpen, setCriadasDiasOpen] = useState(false);
  const [drill, setDrill] = useState<{ title: string; ids: string[] } | null>(null);
  const [selectedSdr, setSelectedSdr] = useState<string>("all");

  // ─── Lookup: somente user_ids de SDRs (filtrado por time se selecionado) ─
  const filteredSdrProfiles = useMemo(
    () => sdrProfiles.filter((p) => teamFilter === "all" ? true : p.sdr_team === teamFilter),
    [sdrProfiles, teamFilter],
  );
  const sdrIds = useMemo(() => new Set(filteredSdrProfiles.map((p) => p.user_id)), [filteredSdrProfiles]);
  const sdrNameById = useMemo(() => {
    const m = new Map<string, string>();
    filteredSdrProfiles.forEach((p) => m.set(p.user_id, p.full_name));
    return m;
  }, [filteredSdrProfiles]);
  const sdrTeamById = useMemo(() => {
    const m = new Map<string, SdrTeam | null>();
    sdrProfiles.forEach((p) => m.set(p.user_id, p.sdr_team ?? null));
    return m;
  }, [sdrProfiles]);

  // ─── Range efetivo ────────────────────────────────────────────
  // Sempre vem do filtro de data único no topo da página.
  const isIntervalMode = Boolean(
    dateRange?.from && dateRange?.to && format(dateRange.from, "yyyy-MM-dd") !== format(dateRange.to, "yyyy-MM-dd"),
  );
  const range = useMemo(() => {
    const fmt = (d: Date) => format(d, "yyyy-MM-dd");
    if (dateRange?.from && dateRange?.to) {
      const a = dateRange.from <= dateRange.to ? dateRange.from : dateRange.to;
      const b = dateRange.from <= dateRange.to ? dateRange.to : dateRange.from;
      return { from: fmt(a), to: fmt(b) };
    }
    return { from: fmt(currentDate), to: fmt(currentDate) };
  }, [dateRange, currentDate]);

  // ─── Pool de agendamentos a considerar ───────────────────────
  // Regra de negócio: contamos para o SDR EFETIVO de cada agendamento, que é
  // sdr_responsavel_id (se transferido) OU created_by. Se esse usuário não
  // for SDR (ex.: criado via Calendário por closer/gestor), descartamos.
  const effectiveSdrId = (a: AgendamentoMetric): string | null => {
    const id = a.sdr_responsavel_id || a.created_by;
    return id && sdrIds.has(id) ? id : null;
  };
  const pool = useMemo(() => {
    if (!range) return [];
    if (filter === "criadas") {
      // Filtramos por created_at convertido para a data LOCAL do navegador.
      // Excluímos reagendamentos (original_agendamento_id != null): eles
      // contam para "Para" (total do dia do SDR), mas não como agenda nova
      // gerada no dia.
      return createdAgs.filter((a) => {
        if (!effectiveSdrId(a)) return false;
        if (a.original_agendamento_id) return false;
        const localDay = localDateOf(a.created_at);
        return localDay >= range.from && localDay <= range.to;
      });
    }
    // Para / Compareceu / Não compareceu → usamos scheduled_date como referência
    const byDate = agendamentos.filter(
      (a) =>
        effectiveSdrId(a) &&
        a.scheduled_date >= range.from &&
        a.scheduled_date <= range.to,
    );
    if (filter === "para") {
      // Todas as reuniões agendadas PARA o período (qualquer status)
      return byDate;
    }
    if (filter === "compareceu") {
      return byDate.filter((a) => getEffectiveStatus(a) === "realizada");
    }
    // nao_compareceu = no_show + cancelada + reagendada.
    // Reagendamentos contam como não comparecimento porque o lead não esteve
    // presente na data/horário previamente combinados.
    return byDate.filter((a) => {
      const eff = getEffectiveStatus(a);
      return eff === "no_show" || eff === "cancelada" || eff === "reagendada";
    });
  }, [agendamentos, createdAgs, sdrIds, range, filter]);

  // ─── Modo taxa (Compareceu / Não compareceu) ─────────────────
  // Nesses filtros exibimos, além do volume, a taxa sobre o total de reuniões
  // marcadas para o mesmo recorte (mesmo dia / mesmo turno / mesmo SDR).
  const isRateMode = filter === "compareceu" || filter === "nao_compareceu";
  const rateLabel = filter === "nao_compareceu" ? "Taxa de não comparecimento" : "Taxa de comparecimento";

  /** Denominador: todas as reuniões agendadas PARA o período (qualquer status). */
  const basePool = useMemo(() => {
    if (!isRateMode) return [] as AgendamentoMetric[];
    return agendamentos.filter(
      (a) =>
        effectiveSdrId(a) &&
        a.scheduled_date >= range.from &&
        a.scheduled_date <= range.to,
    );
  }, [agendamentos, sdrIds, range, isRateMode]);

  const pct = (value: number, base: number) => (base > 0 ? (value / base) * 100 : 0);

  // ─── Dados do gráfico ─────────────────────────────────────────
  // - SDR individual selecionado: cada coluna = um dia do período.
  // - Todos + intervalo: cada coluna = um dia, somando todos os SDRs.
  // - Todos + dia único: cada coluna = um SDR.
  const isDailyView = isIntervalMode || selectedSdr !== "all";

  /** Pool restrito ao SDR escolhido no dropdown do gráfico. */
  const chartPool = useMemo(
    () => (selectedSdr === "all" ? pool : pool.filter((a) => effectiveSdrId(a) === selectedSdr)),
    [pool, selectedSdr, sdrIds],
  );

  /** Denominador do gráfico (todas as marcadas) para o modo taxa. */
  const chartBasePool = useMemo(
    () =>
      selectedSdr === "all" ? basePool : basePool.filter((a) => effectiveSdrId(a) === selectedSdr),
    [basePool, selectedSdr, sdrIds],
  );

  const chartData = useMemo(() => {
    if (isDailyView) {
      // Iteramos cada dia do intervalo e contamos a partir do pool.
      const days = eachDayOfInterval({
        start: parseISO(range.from),
        end: parseISO(range.to),
      });
      const dayCounts = new Map<string, number>();
      const dayBase = new Map<string, number>();
      const daySdrs = new Map<string, Set<string>>();
      chartPool.forEach((a) => {
        const day =
          filter === "criadas" ? localDateOf(a.created_at) : a.scheduled_date;
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
        const sid = effectiveSdrId(a);
        if (sid) {
          if (!daySdrs.has(day)) daySdrs.set(day, new Set());
          daySdrs.get(day)!.add(sid);
        }
      });
      chartBasePool.forEach((a) => {
        dayBase.set(a.scheduled_date, (dayBase.get(a.scheduled_date) || 0) + 1);
      });
      const rows = days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const total = dayCounts.get(key) || 0;
        const sdrsAtivos = daySdrs.get(key)?.size || 0;
        const base = dayBase.get(key) || 0;
        return {
          sdr: format(d, "EEEE, dd/MM/yyyy", { locale: ptBR }),
          shortName: format(d, "dd/MM"),
          total,
          sdrsAtivos,
          base,
          taxa: isRateMode ? Number(pct(total, base).toFixed(1)) : 0,
          mediaPorSdr: sdrsAtivos > 0 ? Number((total / sdrsAtivos).toFixed(1)) : 0,
        };
      });
      // Média móvel diária (janela de 7 dias, trailing).
      const win = 7;
      return rows.map((r, i) => {
        const slice = rows.slice(Math.max(0, i - win + 1), i + 1);
        const avg = slice.reduce((s, x) => s + x.total, 0) / slice.length;
        return { ...r, mediaMovel: Number(avg.toFixed(1)) };
      });

    }
    const counts = new Map<string, number>();
    chartPool.forEach((a) => {
      const key = effectiveSdrId(a);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const bases = new Map<string, number>();
    chartBasePool.forEach((a) => {
      const key = effectiveSdrId(a);
      if (!key) return;
      bases.set(key, (bases.get(key) || 0) + 1);
    });
    return filteredSdrProfiles
      .map((p) => {
        const parts = p.full_name.trim().split(/\s+/);
        const shortName =
          parts.length >= 2 ? `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.` : parts[0];
        const total = counts.get(p.user_id) || 0;
        const base = bases.get(p.user_id) || 0;
        return {
          sdr: p.full_name,
          shortName,
          total,
          sdrsAtivos: 0,
          base,
          taxa: isRateMode ? Number(pct(total, base).toFixed(1)) : 0,
          mediaPorSdr: 0,
          mediaMovel: undefined as number | undefined,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [chartPool, chartBasePool, filteredSdrProfiles, isDailyView, range, filter, isRateMode]);

  const totalGeral = chartData.reduce((s, c) => s + c.total, 0);
  const totalBaseGrafico = chartData.reduce((s, c) => s + (c.base || 0), 0);
  const taxaGrafico = pct(totalGeral, totalBaseGrafico);
  const mediaPorDia = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(range.from), end: parseISO(range.to) }).length || 1;
    return totalGeral / days;
  }, [totalGeral, range]);

  /** Média de agendamentos por SDR ativo (média dos dias com pelo menos 1 SDR ativo). */
  const showMediaPorSdr = isDailyView && selectedSdr === "all";
  const mediaPorSdrAtivo = useMemo(() => {
    if (!showMediaPorSdr) return 0;
    const dias = chartData.filter((c) => (c.sdrsAtivos || 0) > 0);
    if (dias.length === 0) return 0;
    return dias.reduce((s, c) => s + c.total / c.sdrsAtivos, 0) / dias.length;
  }, [chartData, showMediaPorSdr]);



  // ─── KPIs (totais de Criadas / Compareceu / Não compareceu)  ──
  const kpis = useMemo(() => {
    if (!range) return { criadas: 0, para: 0, compareceu: 0, naoCompareceu: 0, foraSdr: 0 };
    const criadas = createdAgs.filter((a) => {
      if (!effectiveSdrId(a)) return false;
      if (a.original_agendamento_id) return false; // reagendamentos não contam como nova
      const localDay = localDateOf(a.created_at);
      return localDay >= range.from && localDay <= range.to;
    }).length;
    const noPeriodo = agendamentos.filter(
      (a) => a.scheduled_date >= range.from && a.scheduled_date <= range.to,
    );
    const dia = noPeriodo.filter((a) => effectiveSdrId(a));
    // Realizadas do período que NÃO são atribuíveis a um SDR ativo
    // (criadas por closer/gestor) — explicam a diferença para o card da agenda.
    const foraSdr = noPeriodo.filter(
      (a) => !effectiveSdrId(a) && getEffectiveStatus(a) === "realizada",
    ).length;
    const para = dia.length;
    const compareceu = dia.filter((a) => getEffectiveStatus(a) === "realizada").length;
    const naoCompareceu = dia.filter((a) => {
      const eff = getEffectiveStatus(a);
      return eff === "no_show" || eff === "cancelada" || eff === "reagendada";
    }).length;
    return { criadas, para, compareceu, naoCompareceu, foraSdr };
  }, [agendamentos, createdAgs, sdrIds, range]);

  // ─── "Criadas" agrupadas pelo dia AGENDADO (para o modal) ─────
  const criadasPorDia = useMemo<CriadasDayGroup[]>(() => {
    if (!range) return [];
    const map = new Map<string, string[]>();
    createdAgs.forEach((a) => {
      if (!effectiveSdrId(a)) return;
      if (a.original_agendamento_id) return;
      const localDay = localDateOf(a.created_at);
      if (localDay < range.from || localDay > range.to) return;
      const arr = map.get(a.scheduled_date) ?? [];
      arr.push(a.id);
      map.set(a.scheduled_date, arr);
    });
    return Array.from(map.entries())
      .map(([date, ids]) => ({ date, ids }))
      .sort((x, y) => x.date.localeCompare(y.date));
  }, [createdAgs, sdrIds, range]);



  // ─── Quadros de turno (Manhã / Tarde / Noite) ─────────────────
  // A referência temporal muda conforme o filtro:
  //  - "Criadas": turno calculado pela HORA DE CRIAÇÃO (created_at).
  //  - "Para" / "Compareceu" / "Não compareceu": turno calculado pelo
  //    HORÁRIO AGENDADO (scheduled_time).
  // Para "Compareceu" e "Não compareceu" no dia de hoje, ainda aplicamos
  // o corte temporal: só conta se o horário agendado já tiver chegado.
  const shiftCounts = useMemo(() => {
    const acc = { madrugada: 0, manha: 0, tarde: 0, noite: 0 };
    const now = new Date();
    const todayStr = brDateFmt.format(now);
    const nowParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: BR_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const nowHour = Number(nowParts.find((p) => p.type === "hour")?.value ?? 0);
    const nowMin = Number(nowParts.find((p) => p.type === "minute")?.value ?? 0);

    pool.forEach((a) => {
      let hour: number | null;
      let minute = 0;

      if (filter === "criadas") {
        // Hora de criação no fuso de Brasília
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: BR_TZ,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date(a.created_at));
        hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
        minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
      } else {
        hour = getHourFromTime(a.scheduled_time);
        const m = /^(\d{1,2}):(\d{2})/.exec(a.scheduled_time || "");
        minute = m ? Number(m[2]) : 0;
      }

      const shift = getShift(hour);
      if (shift === "outros") return;

      // Corte temporal somente para Compareceu / Não compareceu no dia de hoje.
      if (
        (filter === "compareceu" || filter === "nao_compareceu") &&
        a.scheduled_date === todayStr &&
        hour !== null
      ) {
        if (hour > nowHour || (hour === nowHour && minute > nowMin)) return;
      }
      if (
        (filter === "compareceu" || filter === "nao_compareceu") &&
        a.scheduled_date > todayStr
      ) {
        return;
      }

      acc[shift] += 1;
    });
    return acc;
  }, [pool, filter]);

  const periodLabel = useMemo(() => {
    if (isIntervalMode) {
      return `${format(new Date(range.from), "dd/MM/yyyy")} — ${format(new Date(range.to), "dd/MM/yyyy")}`;
    }
    return format(currentDate, "dd/MM/yyyy");
  }, [isIntervalMode, range, currentDate]);

  const filterLabel = FILTER_OPTIONS.find((f) => f.key === filter)?.label ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">Produtividade SDR — {periodLabel}</h2>
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>

      {/* Filtro: tipo de métrica + intervalo */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Filtro:</span>
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = filter === opt.key;
          return (
            <Button
              key={opt.key}
              variant={active ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setFilter(opt.key)}
            >
              <Icon className={cn("h-3 w-3", !active && opt.color)} />
              {opt.label}
            </Button>
          );
        })}

      </div>

      {/* Filtro por time (Tráfego / Social Selling) */}
      <SdrTeamFilter value={teamFilter} onChange={setTeamFilter} />

      {/* KPIs principais (todos visíveis para referência) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={CalendarDays}
          label="Criadas"
          value={kpis.criadas}
          accent="primary"
          active={filter === "criadas"}
          onClick={() => setCriadasDiasOpen(true)}
        />

        <SummaryCard
          icon={CalendarClock}
          label="Para"
          value={kpis.para}
          accent="sky"
          active={filter === "para"}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Compareceu"
          value={kpis.compareceu}
          accent="emerald"
          active={filter === "compareceu"}
          sub={
            kpis.foraSdr > 0
              ? `somente agendas de SDR (${kpis.foraSdr} de closer/gestor fora)`
              : "somente agendas de SDR"
          }
        />
        <SummaryCard
          icon={XCircle}
          label="Não compareceu"
          value={kpis.naoCompareceu}
          accent="destructive"
          active={filter === "nao_compareceu"}
        />
      </div>

      {/* Produtividade por hora — orientada pelo filtro único da página */}
      <ProdutividadePorHoraCard
        createdAgs={createdAgs}
        sdrIds={sdrIds}
        range={range}
      />

      {/* Tendência preditiva — apenas para gestores/moderadores */}
      {isManager && <TrendCardSDR range={range} />}



      {/* Gráfico comparativo */}
      <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {isDailyView ? `Agendamentos por dia — ${filterLabel}` : `Agendamentos por SDR — ${filterLabel}`}
            {selectedSdr !== "all" && ` · ${sdrNameById.get(selectedSdr) ?? "SDR"}`}
          </h3>
          <Select value={selectedSdr} onValueChange={setSelectedSdr}>
            <SelectTrigger className="h-7 w-[210px] text-xs">
              <SelectValue placeholder="Todos os SDRs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os SDRs</SelectItem>
              {filteredSdrProfiles
                .slice()
                .sort((a, b) => a.full_name.localeCompare(b.full_name))
                .map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Total: <span className="font-bold text-foreground">{totalGeral}</span>
            </span>
            <span>
              Média/dia: <span className="font-bold text-foreground">{mediaPorDia.toFixed(1)}</span>
            </span>
            {showMediaPorSdr && (
              <span title="Agendamentos do dia ÷ SDRs ativos no dia (mín. 1 agendamento)">
                Média/SDR ativo:{" "}
                <span className="font-bold text-foreground">{mediaPorSdrAtivo.toFixed(1)}</span>
              </span>
            )}

          </div>
        </div>
        {chartData.length === 0 || totalGeral === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Nenhum agendamento criado por SDRs neste período.
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis
                  dataKey="shortName"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  interval={0}
                  angle={chartData.length > 6 ? -25 : 0}
                  textAnchor={chartData.length > 6 ? "end" : "middle"}
                  height={chartData.length > 6 ? 60 : 30}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "hsl(var(--primary))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}

                  formatter={(value: number, name, item) => {
                    if (name === "mediaMovel")
                      return [
                        <span style={{ color: "hsl(38 92% 50%)" }}>{Number(value).toFixed(1)}</span>,
                        "Média móvel (7d)",
                      ];
                    if (name === "mediaPorSdr") {
                      const ativos = (item?.payload as { sdrsAtivos?: number })?.sdrsAtivos ?? 0;
                      return [
                        <span style={{ color: "hsl(160 84% 45%)" }}>
                          {`${Number(value).toFixed(1)} (${ativos} SDR${ativos !== 1 ? "s" : ""} ativo${ativos !== 1 ? "s" : ""})`}
                        </span>,
                        "Média por SDR ativo",
                      ];
                    }
                    return [`${value} agendamento${value !== 1 ? "s" : ""}`, filterLabel];
                  }}

                  labelFormatter={(label, payload) => {
                    const entry = payload?.[0]?.payload as { sdr?: string } | undefined;
                    return entry?.sdr ?? label;
                  }}
                />
                {isDailyView && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Bar dataKey="total" name={filterLabel} radius={[6, 6, 0, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill="hsl(var(--primary))" fillOpacity={0.85} />
                  ))}
                </Bar>
                {isDailyView && (
                  <Line
                    type="monotone"
                    dataKey="mediaMovel"
                    name="Média móvel (7d)"
                    stroke="hsl(38 92% 50%)"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {showMediaPorSdr && (
                  <Line
                    type="monotone"
                    dataKey="mediaPorSdr"
                    name="Média por SDR ativo"
                    stroke="hsl(160 84% 39%)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                )}

              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Quadros por turno */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <ShiftCard
          icon={MoonStar}
          label="Madrugada"
          range="00h — 06h"
          value={shiftCounts.madrugada}
          totalPeriodo={pool.length}
          color="sky"
        />
        <ShiftCard
          icon={Sun}
          label="Manhã"
          range="06h — 12h"
          value={shiftCounts.manha}
          totalPeriodo={pool.length}
          color="amber"
        />
        <ShiftCard
          icon={Sunset}
          label="Tarde"
          range="12h — 18h"
          value={shiftCounts.tarde}
          totalPeriodo={pool.length}
          color="orange"
        />
        <ShiftCard
          icon={Moon}
          label="Noite"
          range="18h — 24h"
          value={shiftCounts.noite}
          totalPeriodo={pool.length}
          color="indigo"
        />
      </div>


      <CriadasPorDiaDialog
        open={criadasDiasOpen}
        onOpenChange={setCriadasDiasOpen}
        periodLabel={periodLabel}
        groups={criadasPorDia}
        onSelectDay={(date, ids) => {
          setCriadasDiasOpen(false);
          setDrill({
            title: `Criadas em ${periodLabel} — agendadas para ${format(parseISO(date), "dd/MM/yyyy")}`,
            ids,
          });
        }}
      />

      <MetricDrilldownDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        title={drill?.title ?? ""}
        agendamentoIds={drill?.ids ?? []}
      />
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────
function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
  active,
  sub,
  onClick,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number;
  accent: "primary" | "emerald" | "destructive" | "sky";
  active: boolean;
  sub?: string | null;
  onClick?: () => void;
}) {
  const accentClass = {
    primary: "text-primary",
    emerald: "text-emerald-500",
    destructive: "text-destructive",
    sky: "text-sky-500",
  }[accent];
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "rounded-xl border p-4 flex items-center gap-3 transition-all",
        active
          ? "border-primary/40 bg-primary/10 shadow-sm"
          : "border-primary/10 bg-card",
        onClick && "cursor-pointer hover:border-primary/50 hover:bg-primary/5",
      )}
    >

      <Icon className={cn("h-5 w-5 shrink-0", accentClass)} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ShiftCard({
  icon: Icon,
  label,
  range,
  value,
  totalPeriodo,
  color,
}: {
  icon: typeof Sun;
  label: string;
  range: string;
  value: number;
  totalPeriodo: number;
  color: "sky" | "amber" | "orange" | "indigo";
}) {
  const colorMap = {
    sky: "text-sky-400 bg-sky-500/10 border-sky-500/30",
    amber: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    orange: "text-orange-500 bg-orange-500/10 border-orange-500/30",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  };
  const pct = totalPeriodo > 0 ? (value / totalPeriodo) * 100 : 0;
  return (
    <div className={cn("rounded-xl border p-4 space-y-3", colorMap[color])}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div>
          <p className="text-sm font-semibold leading-none">{label}</p>
          <p className="text-[10px] opacity-80 mt-0.5">{range}</p>
        </div>
        <span className="ml-auto text-2xl font-bold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-background/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-current transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] opacity-80">
        {pct.toFixed(0)}% do total do período
      </p>
    </div>
  );
}
