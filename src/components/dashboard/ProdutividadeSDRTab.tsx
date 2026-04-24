import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
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
  Users,
  CalendarDays,
  CheckCircle2,
  XCircle,
  CalendarClock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface AgendamentoMetric {
  id: string;
  scheduled_date: string;
  scheduled_time?: string | null;
  created_at: string;
  status: string;
  channel_type: string | null;
  created_by: string | null;
  sdr_responsavel_id: string | null;
}

interface SDRProfile {
  user_id: string;
  full_name: string;
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
  updatedAgo: string;
}

/** Extrai a hora ("HH:mm" ou ISO) e devolve o número 0-23. */
function getHourFromTime(time?: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (m) return Number(m[1]);
  return null;
}

/** Classifica em manhã/tarde/noite. */
function getShift(hour: number | null): "manha" | "tarde" | "noite" | "outros" {
  if (hour === null) return "outros";
  if (hour >= 6 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  if (hour >= 18 && hour < 24) return "noite";
  return "outros";
}

export default function ProdutividadeSDRTab({
  agendamentos,
  createdAgs,
  sdrProfiles,
  currentDate,
  updatedAgo,
}: Props) {
  const [filter, setFilter] = useState<FilterType>("criadas");
  const [period, setPeriod] = useState<PeriodKey>("hoje");
  const [specificDate, setSpecificDate] = useState<Date | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);

  // ─── Lookup: somente user_ids de SDRs ─────────────────────────
  const sdrIds = useMemo(() => new Set(sdrProfiles.map((p) => p.user_id)), [sdrProfiles]);
  const sdrNameById = useMemo(() => {
    const m = new Map<string, string>();
    sdrProfiles.forEach((p) => m.set(p.user_id, p.full_name));
    return m;
  }, [sdrProfiles]);

  // ─── Range do período selecionado ─────────────────────────────
  const range = useMemo(() => {
    const fmt = (d: Date) => format(d, "yyyy-MM-dd");
    switch (period) {
      case "hoje":
        return { from: fmt(currentDate), to: fmt(currentDate) };
      case "ontem": {
        const d = subDays(currentDate, 1);
        return { from: fmt(d), to: fmt(d) };
      }
      case "semana":
        return {
          from: fmt(startOfWeek(currentDate, { locale: ptBR })),
          to: fmt(endOfWeek(currentDate, { locale: ptBR })),
        };
      case "mes":
        return { from: fmt(startOfMonth(currentDate)), to: fmt(endOfMonth(currentDate)) };
      case "data":
        return specificDate ? { from: fmt(specificDate), to: fmt(specificDate) } : null;
      default:
        return null;
    }
  }, [period, currentDate, specificDate]);

  // ─── Pool de agendamentos a considerar (apenas SDRs via /agendar) ─
  // Regra de negócio: somente reuniões cujo criador seja um SDR.
  // Quem criou via Calendário (closer/gestor/moderador) é descartado.
  const pool = useMemo(() => {
    if (!range) return [];
    if (filter === "criadas") {
      // Filtramos por created_at no range.
      return createdAgs.filter(
        (a) =>
          a.created_by &&
          sdrIds.has(a.created_by) &&
          a.created_at >= `${range.from}T00:00:00` &&
          a.created_at <= `${range.to}T23:59:59`,
      );
    }
    // Para / Compareceu / Não compareceu → usamos scheduled_date como referência
    const byDate = agendamentos.filter(
      (a) =>
        a.created_by &&
        sdrIds.has(a.created_by) &&
        a.scheduled_date >= range.from &&
        a.scheduled_date <= range.to,
    );
    if (filter === "para") {
      // Todas as reuniões agendadas PARA o período (qualquer status)
      return byDate;
    }
    if (filter === "compareceu") {
      return byDate.filter((a) => a.status === "realizada");
    }
    // nao_compareceu = no_show + cancelada
    return byDate.filter((a) => a.status === "no_show" || a.status === "cancelada");
  }, [agendamentos, createdAgs, sdrIds, range, filter]);

  // ─── Dados do gráfico (agendamentos por SDR) ──────────────────
  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    pool.forEach((a) => {
      const key = a.created_by!;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return sdrProfiles
      .map((p) => {
        const parts = p.full_name.trim().split(/\s+/);
        const shortName =
          parts.length >= 2 ? `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.` : parts[0];
        return {
          sdr: p.full_name,
          shortName,
          total: counts.get(p.user_id) || 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [pool, sdrProfiles]);

  const totalGeral = chartData.reduce((s, c) => s + c.total, 0);

  // ─── KPIs (totais de Criadas / Compareceu / Não compareceu)  ──
  const kpis = useMemo(() => {
    if (!range) return { criadas: 0, para: 0, compareceu: 0, naoCompareceu: 0 };
    const criadas = createdAgs.filter(
      (a) =>
        a.created_by &&
        sdrIds.has(a.created_by) &&
        a.created_at >= `${range.from}T00:00:00` &&
        a.created_at <= `${range.to}T23:59:59`,
    ).length;
    const dia = agendamentos.filter(
      (a) =>
        a.created_by &&
        sdrIds.has(a.created_by) &&
        a.scheduled_date >= range.from &&
        a.scheduled_date <= range.to,
    );
    const para = dia.length;
    const compareceu = dia.filter((a) => a.status === "realizada").length;
    const naoCompareceu = dia.filter((a) => a.status === "no_show" || a.status === "cancelada").length;
    return { criadas, para, compareceu, naoCompareceu };
  }, [agendamentos, createdAgs, sdrIds, range]);

  // ─── Quadros de turno (Manhã / Tarde / Noite) ─────────────────
  const shiftCounts = useMemo(() => {
    const acc = { manha: 0, tarde: 0, noite: 0 };
    pool.forEach((a) => {
      const shift = getShift(getHourFromTime(a.scheduled_time));
      if (shift === "manha" || shift === "tarde" || shift === "noite") {
        acc[shift] += 1;
      }
    });
    return acc;
  }, [pool]);

  const periodLabel = useMemo(() => {
    if (!range) return "—";
    if (period === "hoje") return `Hoje (${format(currentDate, "dd/MM")})`;
    if (period === "ontem") return `Ontem (${format(subDays(currentDate, 1), "dd/MM")})`;
    if (period === "semana") return `Semana (${format(new Date(range.from), "dd/MM")} — ${format(new Date(range.to), "dd/MM")})`;
    if (period === "mes") return `Mês (${format(currentDate, "MMMM/yyyy", { locale: ptBR })})`;
    if (period === "data" && specificDate) return format(specificDate, "dd/MM/yyyy");
    return "—";
  }, [period, range, currentDate, specificDate]);

  const filterLabel = FILTER_OPTIONS.find((f) => f.key === filter)?.label ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">Produtividade SDR — {periodLabel}</h2>
        <span className="text-xs text-muted-foreground">{updatedAgo}</span>
      </div>

      {/* Filtro: tipo de métrica */}
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

      {/* Filtro: período */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Período:</span>
        {PERIOD_OPTIONS.map((p) => (
          <Button
            key={p.key}
            variant={period === p.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </Button>
        ))}
        {period === "data" && (
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
                onSelect={(date) => {
                  setSpecificDate(date);
                  setDateOpen(false);
                }}
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* KPIs principais (todos visíveis para referência) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={CalendarDays}
          label="Criadas"
          value={kpis.criadas}
          accent="primary"
          active={filter === "criadas"}
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
        />
        <SummaryCard
          icon={XCircle}
          label="Não compareceu"
          value={kpis.naoCompareceu}
          accent="destructive"
          active={filter === "nao_compareceu"}
        />
      </div>

      {/* Gráfico comparativo */}
      <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Agendamentos por SDR — {filterLabel}
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Total: <span className="font-bold text-foreground">{totalGeral}</span>
          </span>
        </div>
        {chartData.length === 0 || totalGeral === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Nenhum agendamento criado por SDRs neste período.
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
                  itemStyle={{ color: "hsl(var(--primary))", fontWeight: 600 }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: 4 }}
                  formatter={(value: number) => [`${value} agendamento${value !== 1 ? "s" : ""}`, filterLabel]}
                  labelFormatter={(label, payload) => {
                    const entry = payload?.[0]?.payload as { sdr?: string } | undefined;
                    return entry?.sdr ?? label;
                  }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill="hsl(var(--primary))" fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Quadros por turno */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number;
  accent: "primary" | "emerald" | "destructive" | "sky";
  active: boolean;
}) {
  const accentClass = {
    primary: "text-primary",
    emerald: "text-emerald-500",
    destructive: "text-destructive",
    sky: "text-sky-500",
  }[accent];
  return (
    <div
      className={cn(
        "rounded-xl border p-4 flex items-center gap-3 transition-all",
        active
          ? "border-primary/40 bg-primary/10 shadow-sm"
          : "border-primary/10 bg-card",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", accentClass)} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
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
  color: "amber" | "orange" | "indigo";
}) {
  const colorMap = {
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
