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
import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
import { Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  /** Período selecionado no filtro único da página (yyyy-MM-dd). */
  range: { from: string; to: string };
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 07h — 23h

type CmpMode = "prev" | "w1" | "w2" | "w3" | "w4";

const CMP_MODES: { value: CmpMode; label: string }[] = [
  { value: "prev", label: "Período anterior" },
  { value: "w1", label: "Última semana" },
  { value: "w2", label: "Média 2 últimas" },
  { value: "w3", label: "Média 3 últimas" },
  { value: "w4", label: "Média 4 últimas" },
];

const WEEKDAY_NAMES = [
  "domingos",
  "segundas",
  "terças",
  "quartas",
  "quintas",
  "sextas",
  "sábados",
];


const brDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Produtividade por hora dos SDRs (agendas criadas) no período selecionado no
 * filtro único da página, comparado com o período anterior de mesmo tamanho.
 */
export default function ProdutividadePorHoraCard({ createdAgs, sdrIds, range }: Props) {
  const [cumulative, setCumulative] = useState(false);
  const [cmpModeState, setCmpModeState] = useState<CmpMode>("prev");

  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);
  const isSingleDay = range.from === range.to;
  const cmpMode: CmpMode = isSingleDay ? cmpModeState : "prev";

  const periodLabel = isSingleDay
    ? format(to, "dd/MM/yyyy")
    : `${format(from, "dd/MM")} a ${format(to, "dd/MM")}`;

  // Conjunto de dias do período e dos dias usados na comparação.
  const { baseDays, cmpDays, cmpDivisor, cmpLabel } = useMemo(() => {
    const base = new Set<string>();
    for (let i = 0; i < days; i++) base.add(pickedDateToYMD(subDays(to, i)));

    if (cmpMode !== "prev") {
      const weeks = Number(cmpMode.slice(1));
      const dates = Array.from({ length: weeks }, (_, k) => subDays(to, 7 * (k + 1)));
      const cmp = new Set(dates.map(pickedDateToYMD));
      const weekdayName = WEEKDAY_NAMES[to.getDay()];
      const listed = dates.map((d) => format(d, "dd/MM")).join(", ");
      const label =
        weeks === 1
          ? `última ${weekdayName.replace(/s$/, "")} (${listed})`
          : `média ${weeks} últimas ${weekdayName} (${listed})`;
      return { baseDays: base, cmpDays: cmp, cmpDivisor: weeks, cmpLabel: label };
    }

    const cmp = new Set<string>();
    const cmpTo = subDays(from, 1);
    for (let i = 0; i < days; i++) cmp.add(pickedDateToYMD(subDays(cmpTo, i)));
    const cmpFrom = subDays(from, days);
    const label =
      days === 1
        ? format(cmpTo, "dd/MM/yyyy")
        : `${format(cmpFrom, "dd/MM")} a ${format(cmpTo, "dd/MM")}`;
    return { baseDays: base, cmpDays: cmp, cmpDivisor: 1, cmpLabel: label };
  }, [from, to, days, cmpMode]);

  const cmpColumnLabel = cmpMode === "prev" ? "Período anterior" : CMP_MODES.find((m) => m.value === cmpMode)!.label;


  const { data, totals } = useMemo(() => {
    const baseByHour = new Map<number, number>();
    const cmpByHour = new Map<number, number>();

    createdAgs.forEach((a) => {
      const sdr = a.sdr_responsavel_id || a.created_by;
      if (!sdr || !sdrIds.has(sdr)) return;
      if (a.original_agendamento_id) return;
      const day = brDateFmt.format(new Date(a.created_at));
      const isBase = baseDays.has(day);
      const isCmp = cmpDays.has(day);
      if (!isBase && !isCmp) return;
      const hour = brPartsOf(a.created_at).hour;
      if (isBase) baseByHour.set(hour, (baseByHour.get(hour) || 0) + 1);
      if (isCmp) cmpByHour.set(hour, (cmpByHour.get(hour) || 0) + 1);
    });

    let accBase = 0;
    let accCmp = 0;
    const rows = HOURS.map((h) => {
      const b = baseByHour.get(h) || 0;
      const c = (cmpByHour.get(h) || 0) / cmpDivisor;
      accBase += b;
      accCmp += c;
      return {
        hour: `${String(h).padStart(2, "0")}h`,
        hourNum: h,
        base: cumulative ? accBase : b,
        cmp: cumulative ? Number(accCmp.toFixed(1)) : Number(c.toFixed(1)),
      };
    });

    return { data: rows, totals: { base: accBase, cmp: accCmp } };
  }, [createdAgs, sdrIds, baseDays, cmpDays, cmpDivisor, cumulative]);


  const delta = totals.cmp > 0 ? ((totals.base - totals.cmp) / totals.cmp) * 100 : totals.base > 0 ? 100 : 0;

  const highlights = useMemo(() => {
    if (cumulative) return null;
    const withDiff = data.map((r) => ({ ...r, diff: r.base - r.cmp }));
    const sorted = [...withDiff].sort((a, b) => b.diff - a.diff);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (!best || !worst) return null;
    return { best, worst };
  }, [data, cumulative]);

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Produtividade por hora — {periodLabel}</h3>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : delta < 0
                ? "text-destructive border-destructive/30 bg-destructive/10"
                : "text-muted-foreground border-border bg-muted/40",
          )}
          title={`Período: ${totals.base} · Comparação: ${totals.cmp.toFixed(1)}`}
        >
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(0)}% vs {cmpMode === "prev" ? "período anterior" : cmpColumnLabel.toLowerCase()}
        </span>

        <div className="ml-auto flex items-center gap-1 flex-wrap">
          {CMP_MODES.map((m) => (
            <Button
              key={m.value}
              variant={cmpMode === m.value ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2"
              disabled={!isSingleDay && m.value !== "prev"}
              title={
                !isSingleDay && m.value !== "prev"
                  ? "Disponível apenas quando o filtro está em um único dia"
                  : undefined
              }
              onClick={() => setCmpModeState(m.value)}
            >
              {m.label}
            </Button>
          ))}
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
        Agendas novas criadas por SDRs, pela hora de criação (BRT), somando o período do filtro. Comparação:{" "}
        {cmpMode === "prev" ? `período anterior equivalente (${cmpLabel})` : cmpLabel}.
        {!isSingleDay && " Comparação por dia da semana disponível apenas com um único dia selecionado."}
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
            <Bar dataKey="base" name={periodLabel} fill="hsl(var(--primary))" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cmp"
              name={cmpMode === "prev" ? `Período anterior (${cmpLabel})` : cmpLabel}
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
              <th className="text-right font-medium py-1">{periodLabel}</th>
              <th className="text-right font-medium py-1" title={cmpLabel}>{cmpColumnLabel}</th>
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
