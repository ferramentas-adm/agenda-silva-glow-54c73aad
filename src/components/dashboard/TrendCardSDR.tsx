import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import TrendChart, { type TrendDatum } from "./TrendChart";

/**
 * Painel de tendência de agendamentos (criados x realizados) do período
 * selecionado no filtro único da página. Agregação server-side via RPC
 * `dashboard_trend_sdr`.
 */
type SDRMetric = "criadas" | "realizadas" | "showup";

const SDR_METRICS: Record<SDRMetric, { label: string; color: string; format: (v: number) => string; title: string }> = {
  criadas: {
    label: "Agendamentos criados",
    color: "hsl(var(--primary))",
    format: (v) => String(Math.round(v)),
    title: "Tendência de agendamentos criados",
  },
  realizadas: {
    label: "Reuniões realizadas",
    color: "hsl(142 76% 36%)",
    format: (v) => String(Math.round(v)),
    title: "Tendência de reuniões realizadas",
  },
  showup: {
    label: "Taxa de comparecimento (%)",
    color: "hsl(38 92% 50%)",
    format: (v) => `${v.toFixed(1)}%`,
    title: "Tendência de comparecimento",
  },
};

interface Props {
  /** Período selecionado no filtro único da página (yyyy-MM-dd). */
  range: { from: string; to: string };
}

export default function TrendCardSDR({ range }: Props) {
  const [metric, setMetric] = useState<SDRMetric>("criadas");

  // Janela necessária no RPC: do início do período até hoje.
  const windowDays = useMemo(() => {
    const diff = differenceInCalendarDays(new Date(), parseISO(range.from)) + 1;
    return Math.min(365, Math.max(1, diff));
  }, [range.from]);

  const { data: rows = [] } = useQuery<{ day: string; criadas: number; realizadas: number }[]>({
    queryKey: ["trend-sdr-rpc", windowDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_trend_sdr", { _window_days: windowDays });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        day: r.day as string,
        criadas: Number(r.criadas) || 0,
        realizadas: Number(r.realizadas) || 0,
      }));
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const data = useMemo<TrendDatum[]>(() => {
    return rows
      .filter((r) => r.day >= range.from && r.day <= range.to)
      .map((r) => {
        const showup = r.criadas > 0 ? (r.realizadas / r.criadas) * 100 : 0;
        return {
          date: r.day,
          criadas: r.criadas,
          realizadas: r.realizadas,
          showup: Number(showup.toFixed(1)),
        };
      });
  }, [rows, range.from, range.to]);

  const m = SDR_METRICS[metric];
  const periodLabel =
    range.from === range.to
      ? format(parseISO(range.to), "dd/MM/yyyy")
      : `${format(parseISO(range.from), "dd/MM")} a ${format(parseISO(range.to), "dd/MM")}`;

  return (
    <TrendChart
      title={`${m.title} — ${periodLabel}`}
      icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
      data={data}
      primaryKey={metric}
      series={[
        { key: metric, label: m.label, color: m.color, type: "line", format: m.format },
      ]}
      showMovingAverage={false}
      showTrendline
      showComparison={false}
      emptyMessage="Sem agendamentos no período."
      metricOptions={[
        { value: "criadas", label: "Criadas" },
        { value: "realizadas", label: "Realizadas" },
        { value: "showup", label: "Comparecimento" },
      ]}
      currentMetric={metric}
      onMetricChange={(v) => setMetric(v as SDRMetric)}
    />
  );
}
