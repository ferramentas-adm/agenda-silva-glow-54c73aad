import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";

import TrendChart, { type TrendDatum } from "./TrendChart";
import { matchesLeadQualification, type LeadQualificationFilter } from "@/lib/leadQualification";
import { BR_TZ } from "@/lib/timezone";

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
  agendamentos: TrendAgendamento[];
  createdAgs: TrendAgendamento[];
  sdrIds: Set<string>;
  qualificationFilter: LeadQualificationFilter;
}

interface TrendAgendamento {
  id: string;
  created_at: string;
  scheduled_date: string;
  status: string;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  original_agendamento_id?: string | null;
  lead_desqualificado: boolean;
}

const brDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default function TrendCardSDR({ range, agendamentos, createdAgs, sdrIds, qualificationFilter }: Props) {
  const [metric, setMetric] = useState<SDRMetric>("criadas");

  const data = useMemo<TrendDatum[]>(() => {
    const rows = new Map<string, { criadas: number; realizadas: number }>();
    const belongsToSdr = (a: TrendAgendamento) => {
      const sdrId = a.sdr_responsavel_id || a.created_by;
      return Boolean(sdrId && sdrIds.has(sdrId));
    };
    createdAgs.forEach((a) => {
      if (!belongsToSdr(a) || a.original_agendamento_id) return;
      if (!matchesLeadQualification(a.lead_desqualificado, qualificationFilter)) return;
      const day = brDateFmt.format(new Date(a.created_at));
      if (day < range.from || day > range.to) return;
      const row = rows.get(day) ?? { criadas: 0, realizadas: 0 };
      row.criadas += 1;
      rows.set(day, row);
    });
    agendamentos.forEach((a) => {
      if (!belongsToSdr(a) || a.status !== "realizada") return;
      if (!matchesLeadQualification(a.lead_desqualificado, qualificationFilter)) return;
      if (a.scheduled_date < range.from || a.scheduled_date > range.to) return;
      const row = rows.get(a.scheduled_date) ?? { criadas: 0, realizadas: 0 };
      row.realizadas += 1;
      rows.set(a.scheduled_date, row);
    });
    return Array.from(rows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, row]) => {
        const showup = row.criadas > 0 ? (row.realizadas / row.criadas) * 100 : 0;
        return {
          date: day,
          criadas: row.criadas,
          realizadas: row.realizadas,
          showup: Number(showup.toFixed(1)),
        };
      });
  }, [agendamentos, createdAgs, qualificationFilter, range.from, range.to, sdrIds]);

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
