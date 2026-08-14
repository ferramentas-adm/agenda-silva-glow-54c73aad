import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, TrendingUp, TrendingDown, Minus, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BR_TZ, brPartsOf, pickedDateToYMD } from "@/lib/timezone";

export interface HourAgendamento {
  id: string;
  created_at: string;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  original_agendamento_id?: string | null;
}

interface Props {
  /** Pool amplo de agendamentos buscados por created_at (últimos ~2 meses). */
  createdAgs: HourAgendamento[];
  /** user_ids de SDRs considerados (já filtrados por time). */
  sdrIds: Set<string>;
  /** Dia base da análise (o mesmo do filtro superior). */
  baseDate: Date;
}

type CompareMode = "ontem" | "semana" | "media7" | "custom";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 07h — 23h

const brDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Produtividade por hora dos SDRs (agendas criadas), comparando o dia base
 * com outro dia (ontem, mesmo dia da semana anterior, média dos 7 dias
 * anteriores ou uma data escolhida).
 */
export default function ProdutividadePorHoraCard({ createdAgs, sdrIds, baseDate }: Props) {
  const [mode, setMode] = useState<CompareMode>("ontem");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [dateOpen, setDateOpen] = useState(false);
  const [cumulative, setCumulative] = useState(false);

  const baseStr = pickedDateToYMD(baseDate);

  // Datas de comparação (uma ou várias, no caso da média).
  const compare = useMemo(() => {
    if (mode === "ontem") {
      return { dates: [pickedDateToYMD(subDays(baseDate, 1))], label: "Dia anterior", isAvg: false };
    }
    if (mode === "semana") {
      const d = subDays(baseDate, 7);
      return {
        dates: [pickedDateToYMD(d)],
        label: `${format(d, "EEEE, dd/MM", { locale: ptBR })}`,
        isAvg: false,
      };
    }
    if (mode === "custom" && customDate) {
      return { dates: [pickedDateToYMD(customDate)], label: format(customDate, "dd/MM/yyyy"), isAvg: false };
    }
    const dates = Array.from({ length: 7 }, (_, i) => pickedDateToYMD(subDays(baseDate, i + 1)));
    return { dates, label: "Média dos 7 dias anteriores", isAvg: true };
  }, [mode, customDate, baseDate]);

  // Contagem por hora (criação, fuso BRT) — apenas agendas novas de SDR.
  const { data, totals } = useMemo(() => {
    const baseByHour = new Map<number, number>();
    const cmpByHour = new Map<number, number>();
    const cmpSet = new Set(compare.dates);

    createdAgs.forEach((a) => {
      const sdr = a.sdr_responsavel_id || a.created_by;
      if (!sdr || !sdrIds.has(sdr)) return;
      if (a.original_agendamento_id) return;
      const day = brDateFmt.format(new Date(a.created_at));
      const isBase = day === baseStr;
      const isCmp = cmpSet.has(day);
      if (!isBase && !isCmp) return;
      const hour = brPartsOf(a.created_at).hour;
      if (isBase) baseByHour.set(hour, (baseByHour.get(hour) || 0) + 1);
      if (isCmp) cmpByHour.set(hour, (cmpByHour.get(hour) || 0) + 1);
    });

    const divisor = compare.isAvg ? compare.dates.length : 1;
    let accBase = 0;
    let accCmp = 0;
    const rows = HOURS.map((h) => {
      const b = baseByHour.get(h) || 0;
      const c = (cmpByHour.get(h) || 0) / divisor;
      accBase += b;
      accCmp += c;
      return {
        hour: `${String(h).padStart(2, "0")}h`,
        hourNum: h,
        base: cumulative ? accBase : b,
        cmp: cumulative ? Number(accCmp.toFixed(1)) : Number(c.toFixed(1)),
      };
    });

    const totalBase = rows.reduce((s, r) => s + (cumulative ? 0 : r.base), cumulative ? accBase : 0);
    const totalCmp = cumulative ? accCmp : rows.reduce((s, r) => s + r.cmp, 0);
    return { data: rows, totals: { base: totalBase, cmp: totalCmp } };
  }, [createdAgs, sdrIds, baseStr, compare, cumulative]);

  const delta = totals.cmp > 0 ? ((totals.base - totals.cmp) / totals.cmp) * 100 : totals.base > 0 ? 100 : 0;

  // Melhor e pior hora em relação à comparação
  const highlights = useMemo(() => {
    if (cumulative) return null;
    const withDiff = data.map((r) => ({ ...r, diff: r.base - r.cmp }));
    const sorted = [...withDiff].sort((a, b) => b.diff - a.diff);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (!best || !worst) return null;
    return { best, worst };
  }, [data, cumulative]);

  const nowHour = brPartsOf().hour;
  const isToday = baseStr === brDateFmt.format(new Date());

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          Produtividade por hora — {format(baseDate, "dd/MM/yyyy")}
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : delta < 0
                ? "text-destructive border-destructive/30 bg-destructive/10"
                : "text-muted-foreground border-border bg-muted/40",
          )}
          title={`Dia base: ${totals.base} · Comparação: ${totals.cmp.toFixed(1)}`}
        >
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(0)}% vs comparação
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            {([
              { v: "ontem", l: "Ontem" },
              { v: "semana", l: "Semana passada" },
              { v: "media7", l: "Média 7d" },
            ] as { v: CompareMode; l: string }[]).map((o) => (
              <Button
                key={o.v}
                variant={mode === o.v ? "default" : "ghost"}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setMode(o.v)}
              >
                {o.l}
              </Button>
            ))}
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={mode === "custom" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-xs px-2 gap-1"
                >
                  <CalendarDays className="h-3 w-3" />
                  {mode === "custom" && customDate ? format(customDate, "dd/MM") : "Outro dia"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(d) => {
                    if (!d) return;
                    setCustomDate(d);
                    setMode("custom");
                    setDateOpen(false);
                  }}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button
            variant={cumulative ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCumulative((v) => !v)}
          >
            {cumulative ? "Acumulado" : "Hora a hora"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Agendas novas criadas por SDRs, pela hora de criação (BRT). Comparação: {compare.label}.
        {isToday && !cumulative && ` Hoje já são ${String(nowHour).padStart(2, "0")}h.`}
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: 4 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="base" name={format(baseDate, "dd/MM")} fill="hsl(var(--primary))" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cmp"
              name={compare.label}
              stroke="hsl(38 92% 50%)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {highlights && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300">
            Melhor hora vs comparação: <strong>{highlights.best.hour}</strong> — {highlights.best.base} vs{" "}
            {highlights.best.cmp} ({highlights.best.diff >= 0 ? "+" : ""}
            {highlights.best.diff.toFixed(1)})
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
            Pior hora vs comparação: <strong>{highlights.worst.hour}</strong> — {highlights.worst.base} vs{" "}
            {highlights.worst.cmp} ({highlights.worst.diff >= 0 ? "+" : ""}
            {highlights.worst.diff.toFixed(1)})
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-1">Hora</th>
              <th className="text-right font-medium py-1">{format(baseDate, "dd/MM")}</th>
              <th className="text-right font-medium py-1">Comparação</th>
              <th className="text-right font-medium py-1">Δ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const diff = r.base - r.cmp;
              return (
                <tr key={r.hour} className="border-t border-border/50">
                  <td className="py-1">{r.hour}</td>
                  <td className="py-1 text-right font-semibold">{r.base}</td>
                  <td className="py-1 text-right text-muted-foreground">{r.cmp}</td>
                  <td
                    className={cn(
                      "py-1 text-right font-semibold",
                      diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(1)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border">
              <td className="py-1 font-semibold">Total</td>
              <td className="py-1 text-right font-bold">{totals.base}</td>
              <td className="py-1 text-right text-muted-foreground">{totals.cmp.toFixed(1)}</td>
              <td className="py-1 text-right font-bold">
                {totals.base - totals.cmp > 0 ? "+" : ""}
                {(totals.base - totals.cmp).toFixed(1)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
