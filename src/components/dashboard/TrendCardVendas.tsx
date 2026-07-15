import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import TrendChart, { type TrendDatum, type TrendWindow } from "./TrendChart";


/**
 * Painel de tendência de vendas e taxa de conversão.
 * Agregação server-side via RPC `dashboard_trend_vendas` — retorna, por dia,
 * reuniões realizadas, vendas fechadas e faturamento, já excluindo
 * "Call Interompida/Interrompida" do denominador.
 */
type MetricKey = "conversao" | "ticketMedio";

const METRICS: Record<MetricKey, { label: string; color: string; format: (v: number) => string; title: string; empty: string }> = {
  conversao: {
    label: "Taxa de conversão (%)",
    color: "hsl(38 92% 50%)",
    format: (v) => `${v.toFixed(1)}%`,
    title: "Tendência de conversão",
    empty: "Sem reuniões realizadas no período.",
  },
  ticketMedio: {
    label: "Tíquete médio (R$)",
    color: "hsl(142 76% 36%)",
    format: (v) =>
      v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    title: "Tendência de tíquete médio",
    empty: "Sem vendas no período.",
  },
};

export default function TrendCardVendas({ closerId }: { closerId?: string | null }) {
  const [windowDays, setWindowDays] = useState<TrendWindow>(30);
  const [metric, setMetric] = useState<MetricKey>("conversao");

  const { data: rows = [] } = useQuery<{ day: string; realizadas: number; vendas: number; faturamento: number }[]>({
    queryKey: ["trend-vendas-rpc", windowDays, closerId ?? "all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_trend_vendas", {
        _window_days: windowDays,
        _closer_id: closerId ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        day: r.day as string,
        realizadas: Number(r.realizadas) || 0,
        vendas: Number(r.vendas) || 0,
        faturamento: Number(r.faturamento) || 0,
      }));
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const data = useMemo<TrendDatum[]>(() => {
    return rows.map((b) => {
      const conversao = b.realizadas > 0 ? (b.vendas / b.realizadas) * 100 : 0;
      const ticketMedio = b.vendas > 0 ? b.faturamento / b.vendas : 0;
      return {
        date: b.day,
        vendas: b.vendas,
        faturamento: Math.round(b.faturamento),
        conversao: Number(conversao.toFixed(1)),
        ticketMedio: Math.round(ticketMedio),
      };
    });
  }, [rows]);

  const m = METRICS[metric];

  return (
    <TrendChart
      title={`${m.title} — ${windowDays} dias`}
      icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
      data={data}
      primaryKey={metric}
      series={[
        {
          key: metric,
          label: m.label,
          color: m.color,
          type: "line",
          format: m.format,
        },
      ]}
      windowDays={windowDays}
      onWindowChange={setWindowDays}
      showMovingAverage={false}
      showTrendline
      showComparison={false}
      emptyMessage={m.empty}
      metricOptions={[
        { value: "conversao", label: "Conversão" },
        { value: "ticketMedio", label: "Tíquete médio" },
      ]}
      currentMetric={metric}
      onMetricChange={(v) => setMetric(v as MetricKey)}
    />
  );
}
