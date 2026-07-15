import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import TrendChart, { type TrendDatum, type TrendWindow } from "./TrendChart";

/**
 * Painel de tendência de agendamentos (criados x realizados) dos últimos N dias.
 * Agregação server-side via RPC `dashboard_trend_sdr` — evita paginação e
 * download de milhares de linhas apenas para contar por dia.
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

export default function TrendCardSDR() {
  const [windowDays, setWindowDays] = useState<TrendWindow>(30);
  const [metric, setMetric] = useState<SDRMetric>("criadas");

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
    return rows.map((r) => {
      const showup = r.criadas > 0 ? (r.realizadas / r.criadas) * 100 : 0;
      return {
        date: r.day,
        criadas: r.criadas,
        realizadas: r.realizadas,
        showup: Number(showup.toFixed(1)),
      };
    });
  }, [rows]);

  const m = SDR_METRICS[metric];

  return (
    <TrendChart
      title={`${m.title} — ${windowDays} dias`}
      icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
      data={data}
      primaryKey={metric}
      series={[
        { key: metric, label: m.label, color: m.color, type: "line", format: m.format },
      ]}
      windowDays={windowDays}
      onWindowChange={setWindowDays}
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
