import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eachDayOfInterval, format, subDays } from "date-fns";
import { CalendarDays } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brDateOf } from "@/lib/timezone";
import TrendChart, { type TrendDatum, type TrendWindow } from "./TrendChart";

/**
 * Painel de tendência de agendamentos (criados x realizados) dos últimos N dias.
 * Usa janela rolante independente do filtro de dia da aba.
 * Considera apenas agendamentos criados por SDRs (created_by ∈ user_roles.sdr).
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

  // Conjunto de user_ids com role 'sdr' — para filtrar created_by.
  const { data: sdrIds = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ["trend-sdr-user-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.user_id as string));
    },
    staleTime: 10 * 60_000,
  });

  const { data: rows = [] } = useQuery<
    { id: string; created_at: string; scheduled_date: string; status: string; created_by: string | null; sdr_responsavel_id: string | null; original_agendamento_id: string | null }[]
  >({
    queryKey: ["trend-sdr-ags", windowDays],
    queryFn: async () => {
      const since = subDays(new Date(), windowDays + 1);
      const sinceYmd = format(since, "yyyy-MM-dd");
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("agendamentos")
          .select(
            "id, created_at, scheduled_date, status, created_by, sdr_responsavel_id, original_agendamento_id",
          )
          .is("deleted_at", null)
          .or(`created_at.gte.${sinceYmd}T00:00:00Z,scheduled_date.gte.${sinceYmd}`)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as any[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const data = useMemo<TrendDatum[]>(() => {
    const end = new Date();
    const start = subDays(end, windowDays - 1);
    const days = eachDayOfInterval({ start, end });
    const startYmd = format(start, "yyyy-MM-dd");
    const endYmd = format(end, "yyyy-MM-dd");

    const isSdr = (a: { created_by: string | null; sdr_responsavel_id: string | null }) => {
      const id = a.sdr_responsavel_id || a.created_by;
      return id ? sdrIds.has(id) : false;
    };

    const criadasMap = new Map<string, number>();
    const realizadasMap = new Map<string, number>();

    rows.forEach((a) => {
      if (!isSdr(a)) return;
      // Criadas: created_at no fuso BRT, excluindo reagendamentos
      if (!a.original_agendamento_id) {
        const day = brDateOf(a.created_at);
        if (day >= startYmd && day <= endYmd) {
          criadasMap.set(day, (criadasMap.get(day) || 0) + 1);
        }
      }
      // Realizadas: scheduled_date no período, status realizada
      if (a.status === "realizada" && a.scheduled_date >= startYmd && a.scheduled_date <= endYmd) {
        realizadasMap.set(a.scheduled_date, (realizadasMap.get(a.scheduled_date) || 0) + 1);
      }
    });

    return days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const criadas = criadasMap.get(key) || 0;
      const realizadas = realizadasMap.get(key) || 0;
      const showup = criadas > 0 ? (realizadas / criadas) * 100 : 0;
      return {
        date: key,
        criadas,
        realizadas,
        showup: Number(showup.toFixed(1)),
      };
    });
  }, [rows, sdrIds, windowDays]);

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
