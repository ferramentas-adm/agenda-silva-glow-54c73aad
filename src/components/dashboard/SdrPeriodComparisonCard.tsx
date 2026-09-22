import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Minus, GitCompareArrows } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { brTodayYMD } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { matchesLeadQualification, type LeadQualificationFilter } from "@/lib/leadQualification";

/**
 * Comparação de produtividade de um SDR entre dois intervalos equivalentes.
 * Janelas fixas: 7, 15, 30, 60 e 90 dias.
 * Ex.: hoje 20/08 + "7 dias" → 13/08–20/08 vs 05/08–12/08.
 */
const WINDOWS = [7, 15, 30, 60, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

interface Row {
  id: string;
  created_at: string;
  scheduled_date: string;
  status: string;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  original_agendamento_id: string | null;
  lead_desqualificado: boolean;
}

const BR_TZ = "America/Sao_Paulo";
const brDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const localDateOf = (iso: string) => brDateFmt.format(new Date(iso));

function periods(win: WindowDays) {
  const today = parseISO(brTodayYMD());
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const curFrom = subDays(today, win - 1);
  const prevTo = subDays(curFrom, 1);
  const prevFrom = subDays(prevTo, win - 1);
  return {
    current: { from: fmt(curFrom), to: fmt(today) },
    previous: { from: fmt(prevFrom), to: fmt(prevTo) },
    days: win,
  };
}


interface Metrics {
  criadas: number;
  marcadas: number;
  compareceu: number;
  naoCompareceu: number;
  taxa: number;
  mediaDia: number;
}

function computeMetrics(rows: Row[], sdrId: string, from: string, to: string, days: number, qualificationFilter: LeadQualificationFilter): Metrics {
  const mine = rows.filter(
    (r) => (r.sdr_responsavel_id || r.created_by) === sdrId && matchesLeadQualification(r.lead_desqualificado, qualificationFilter),
  );
  const criadas = mine.filter(
    (r) => !r.original_agendamento_id && localDateOf(r.created_at) >= from && localDateOf(r.created_at) <= to,
  ).length;
  const byDate = mine.filter((r) => r.scheduled_date >= from && r.scheduled_date <= to);
  const compareceu = byDate.filter((r) => r.status === "realizada").length;
  const naoCompareceu = byDate.filter(
    (r) => r.status === "no_show" || r.status === "cancelada" || r.status === "reagendada",
  ).length;
  return {
    criadas,
    marcadas: byDate.length,
    compareceu,
    naoCompareceu,
    taxa: byDate.length > 0 ? (compareceu / byDate.length) * 100 : 0,
    mediaDia: criadas / days,
  };
}

interface Props {
  sdrId: string;
  sdrName: string;
  qualificationFilter: LeadQualificationFilter;
}

export default function SdrPeriodComparisonCard({ sdrId, sdrName, qualificationFilter }: Props) {
  const [win, setWin] = useState<WindowDays | null>(null);

  const p = useMemo(() => (win ? periods(win) : null), [win]);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["sdr-period-comparison", sdrId, win],
    enabled: Boolean(p),
    staleTime: 60_000,
    queryFn: async () => {
      const start = p!.previous.from;
      const end = p!.current.to;
      const select =
        "id, created_at, scheduled_date, status, created_by, sdr_responsavel_id, original_agendamento_id, lead_desqualificado";
      const mineFilter = `sdr_responsavel_id.eq.${sdrId},and(sdr_responsavel_id.is.null,created_by.eq.${sdrId})`;
      const [byDate, byCreated] = await Promise.all([
        supabase
          .from("agendamentos")
          .select(select)
          .is("deleted_at", null)
          .or(mineFilter)
          .gte("scheduled_date", start)
          .lte("scheduled_date", end)
          .limit(5000),
        supabase
          .from("agendamentos")
          .select(select)
          .is("deleted_at", null)
          .or(mineFilter)
          .gte("created_at", `${start}T00:00:00-03:00`)
          .lte("created_at", `${end}T23:59:59-03:00`)
          .limit(5000),
      ]);
      if (byDate.error) throw byDate.error;
      if (byCreated.error) throw byCreated.error;
      const map = new Map<string, Row>();
      [...(byDate.data ?? []), ...(byCreated.data ?? [])].forEach((r: any) => map.set(r.id, r as Row));
      return Array.from(map.values());
    },

  });

  const cur = p ? computeMetrics(rows, sdrId, p.current.from, p.current.to, p.days, qualificationFilter) : null;
  const prev = p ? computeMetrics(rows, sdrId, p.previous.from, p.previous.to, p.days, qualificationFilter) : null;

  const label = (iso: string) => format(parseISO(iso), "dd/MM");

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Comparar períodos — {sdrName}</h3>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          {WINDOWS.map((w) => (
            <Button
              key={w}
              size="sm"
              variant={win === w ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setWin(win === w ? null : w)}
            >
              {w} dias
            </Button>
          ))}
        </div>
      </div>

      {!p ? (
        <p className="text-xs text-muted-foreground italic">
          Escolha uma janela para comparar os últimos N dias com os N dias anteriores.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {label(p.current.from)} — {label(p.current.to)}
            </span>{" "}
            vs{" "}
            <span className="font-semibold text-foreground">
              {label(p.previous.from)} — {label(p.previous.to)}
            </span>{" "}
            ({p.days} dias cada)
          </p>

          {isLoading || !cur || !prev ? (
            <p className="text-xs text-muted-foreground italic py-4">Carregando…</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              <CompareCell title="Criadas" cur={cur.criadas} prev={prev.criadas} />
              <CompareCell title="Média/dia" cur={cur.mediaDia} prev={prev.mediaDia} decimals={1} />
              <CompareCell title="Marcadas" cur={cur.marcadas} prev={prev.marcadas} />
              <CompareCell title="Compareceu" cur={cur.compareceu} prev={prev.compareceu} />
              <CompareCell title="Não compareceu" cur={cur.naoCompareceu} prev={prev.naoCompareceu} invert />
              <CompareCell title="Taxa compar." cur={cur.taxa} prev={prev.taxa} decimals={1} suffix="%" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CompareCell({
  title,
  cur,
  prev,
  decimals = 0,
  suffix = "",
  invert = false,
}: {
  title: string;
  cur: number;
  prev: number;
  decimals?: number;
  suffix?: string;
  invert?: boolean;
}) {
  const delta = prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
  const up = delta > 0.05;
  const down = delta < -0.05;
  const good = invert ? down : up;
  const bad = invert ? up : down;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <p className="text-[11px] text-muted-foreground truncate">{title}</p>
      <p className="text-lg font-bold leading-tight">
        {cur.toFixed(decimals)}
        {suffix}
      </p>
      <div
        className={cn(
          "mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold",
          good
            ? "text-emerald-600 dark:text-emerald-400"
            : bad
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {up ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : down ? (
          <ArrowDownRight className="h-3 w-3" />
        ) : (
          <Minus className="h-3 w-3" />
        )}
        {delta > 0 ? "+" : ""}
        {delta.toFixed(0)}%
      </div>
      <p className="text-[10px] text-muted-foreground">
        anterior: {prev.toFixed(decimals)}
        {suffix}
      </p>
    </div>
  );
}
