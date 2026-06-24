import { useMemo, useState, type ReactNode } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type TrendWindow = 7 | 15 | 30 | 60 | 90;

export interface TrendSeries {
  /** Chave do campo no dataset (ex.: "criadas"). */
  key: string;
  /** Rótulo amigável. */
  label: string;
  /** Token HSL semântico (ex.: "hsl(var(--primary))"). */
  color: string;
  /** "bar" | "line". Linha tracejada é via `dashed: true`. */
  type: "bar" | "line";
  dashed?: boolean;
  /** Eixo Y: "left" (padrão) ou "right". */
  yAxis?: "left" | "right";
  /** Formato de valor exibido no tooltip / badge. */
  format?: (v: number) => string;
  /** Se true, esta série não aparece no gráfico — só no cálculo de média móvel.
   *  Útil para a linha tracejada de MM gerada automaticamente. */
  hidden?: boolean;
}

export interface TrendDatum {
  /** yyyy-MM-dd. */
  date: string;
  /** Valores por chave da série. */
  [key: string]: string | number;
}

interface TrendChartProps {
  title: string;
  icon: ReactNode;
  data: TrendDatum[];
  series: TrendSeries[];
  /** Chave da série usada para badge de variação e detecção de queda. */
  primaryKey: string;
  /** Mostra média móvel da série primária como linha tracejada. */
  showMovingAverage?: boolean;
  /** Mostra linha de tendência (regressão linear) da série primária. */
  showTrendline?: boolean;
  /** Mostra badge de comparação metade-recente vs metade-anterior. */
  showComparison?: boolean;
  windowDays: TrendWindow;
  onWindowChange: (w: TrendWindow) => void;
  /** Eixo Y direito é necessário? Define o range/formatter dele. */
  rightAxisFormatter?: (v: number) => string;
  emptyMessage?: string;
  /** Toggle de métrica exibida no card (opcional). */
  metricOptions?: { value: string; label: string }[];
  currentMetric?: string;
  onMetricChange?: (v: string) => void;
}

const MM_KEY = "__mm7";
const TREND_KEY = "__trend";

function linearRegression(values: number[]): { a: number; b: number } | null {
  const n = values.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += values[i];
    sxx += i * i;
    sxy += i * values[i];
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  return { a, b };
}

function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((s, n) => s + n, 0) / window;
  });
}

export default function TrendChart({
  title,
  icon,
  data,
  series,
  primaryKey,
  showMovingAverage = true,
  showTrendline = false,
  showComparison = true,
  windowDays,
  onWindowChange,
  rightAxisFormatter,
  emptyMessage = "Sem dados no período.",
  metricOptions,
  currentMetric,
  onMetricChange,
}: TrendChartProps) {
  // Anexa MM da série primária aos dados (janela adaptativa)
  const mmWindow = data.length >= 30 ? 7 : data.length >= 14 ? 5 : 3;
  const useMM = showMovingAverage && !showTrendline && data.length >= 8;
  const enriched = useMemo<TrendDatum[]>(() => {
    if (data.length === 0) return data;
    const values = data.map((d) => Number(d[primaryKey] ?? 0));
    const mm = useMM ? movingAverage(values, mmWindow) : null;
    const reg = showTrendline ? linearRegression(values) : null;
    return data.map((d, i) => {
      const out: TrendDatum = { ...d };
      if (mm) out[MM_KEY] = mm[i] ?? 0;
      if (reg) out[TREND_KEY] = Number((reg.a * i + reg.b).toFixed(2));
      return out;
    });
  }, [data, primaryKey, useMM, mmWindow, showTrendline]);

  const trendSlope = useMemo(() => {
    if (!showTrendline || data.length < 2) return 0;
    const values = data.map((d) => Number(d[primaryKey] ?? 0));
    return linearRegression(values)?.a ?? 0;
  }, [data, primaryKey, showTrendline]);
  const trendColor =
    trendSlope > 0.001
      ? "hsl(142 76% 36%)"
      : trendSlope < -0.001
        ? "hsl(var(--destructive))"
        : "hsl(var(--muted-foreground))";

  // Variação metade recente vs metade anterior do período
  const insight = useMemo(() => {
    if (data.length < 4) return null;
    const values = data.map((d) => Number(d[primaryKey] ?? 0));
    const half = Math.floor(values.length / 2);
    const recent = values.slice(-half).reduce((s, n) => s + n, 0);
    const prior = values.slice(-half * 2, -half).reduce((s, n) => s + n, 0);
    const delta = prior === 0 ? (recent > 0 ? 100 : 0) : ((recent - prior) / prior) * 100;
    return { recent, prior, delta, half };
  }, [data, primaryKey]);

  const downtrend = insight ? insight.delta <= -15 : false;
  const primarySeries = series.find((s) => s.key === primaryKey);
  const fmtPrimary = primarySeries?.format ?? ((v: number) => String(Math.round(v)));

  const mmLabel = `Média móvel ${mmWindow}d`;
  const tooltipFormatter = (value: number, name: string) => {
    if (name === mmLabel) {
      return [fmtPrimary(value), name];
    }
    const s = series.find((sr) => sr.label === name);
    return [s?.format ? s.format(value) : Math.round(value), name];
  };

  const hasRightAxis = series.some((s) => s.yAxis === "right");
  const hasData = enriched.length > 0 && enriched.some((d) => series.some((s) => Number(d[s.key] ?? 0) > 0));

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>

        {showComparison && insight && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
              insight.delta > 0
                ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : insight.delta < 0
                  ? "text-destructive border-destructive/30 bg-destructive/10"
                  : "text-muted-foreground border-border bg-muted/40",
            )}
            title={`Últimos ${insight.half}d: ${fmtPrimary(insight.recent)} · ${insight.half}d anteriores: ${fmtPrimary(insight.prior)}`}
          >
            {insight.delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : insight.delta < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {insight.delta > 0 ? "+" : ""}
            {insight.delta.toFixed(0)}% ({insight.half}d vs {insight.half}d)
          </span>
        )}

        {showTrendline && data.length >= 2 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
              trendSlope > 0.001
                ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : trendSlope < -0.001
                  ? "text-destructive border-destructive/30 bg-destructive/10"
                  : "text-muted-foreground border-border bg-muted/40",
            )}
            title="Inclinação da linha de tendência sobre o período"
          >
            {trendSlope > 0.001 ? (
              <TrendingUp className="h-3 w-3" />
            ) : trendSlope < -0.001 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {trendSlope > 0.001 ? "Subindo" : trendSlope < -0.001 ? "Caindo" : "Estável"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {metricOptions && metricOptions.length > 1 && (
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              {metricOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={currentMetric === opt.value ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => onMetricChange?.(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            {([7, 15, 30, 60, 90] as TrendWindow[]).map((w) => (
              <Button
                key={w}
                variant={windowDays === w ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => onWindowChange(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>
      </div>

      {showComparison && downtrend && (
        <div className="flex items-center gap-2 text-xs rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Tendência de queda detectada — últimos {insight!.half}d {insight!.delta.toFixed(0)}% abaixo dos
            {" "}{insight!.half}d anteriores. Avalie ações de marketing/vendas.
          </span>
        </div>
      )}

      {!hasData ? (
        <p className="text-sm text-muted-foreground italic py-10 text-center">{emptyMessage}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={enriched} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="date"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(v: string) => format(parseISO(v), "dd/MM")}
                interval={Math.max(0, Math.floor(enriched.length / 12))}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              {hasRightAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={rightAxisFormatter ?? ((v: number) => String(Math.round(v)))}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v: string) =>
                  format(parseISO(v), "EEEE, dd/MM/yyyy", { locale: ptBR })
                }
                formatter={tooltipFormatter as any}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />

              {series
                .filter((s) => !s.hidden)
                .map((s) => (
                  <Line
                    key={s.key}
                    yAxisId={s.yAxis ?? "left"}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2.5}
                    strokeDasharray={s.dashed ? "4 4" : undefined}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}

              {useMM && (
                <Line
                  yAxisId={primarySeries?.yAxis ?? "left"}
                  type="monotone"
                  dataKey={MM_KEY}
                  name={mmLabel}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}

              {showTrendline && (
                <Line
                  yAxisId={primarySeries?.yAxis ?? "left"}
                  type="linear"
                  dataKey={TREND_KEY}
                  name="Tendência"
                  stroke={trendColor}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
