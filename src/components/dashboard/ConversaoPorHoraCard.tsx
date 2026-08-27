import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pickedDateToYMD } from "@/lib/timezone";

interface Props {
  /** Período selecionado no filtro da página (yyyy-MM-dd). */
  range: { from: string; to: string };
  /** Quando informado, restringe aos números de um closer. */
  closerId?: string | null;
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

interface RealizadaRow {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
}

interface VendaHoraRow {
  agendamento_id: string;
  scheduled_date: string;
  scheduled_time: string;
}

const hourOf = (time: string | null | undefined): number | null => {
  if (!time) return null;
  const h = Number(String(time).slice(0, 2));
  return Number.isFinite(h) ? h : null;
};

/**
 * Conversão por hora: reuniões realizadas x vendas de 1ª call, agrupadas pela
 * hora da reunião (scheduled_time, já em BRT), com comparativo de período.
 */
export default function ConversaoPorHoraCard({ range, closerId }: Props) {
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

  const cmpColumnLabel =
    cmpMode === "prev" ? "Período anterior" : CMP_MODES.find((m) => m.value === cmpMode)!.label;

  // Janela server-side: cobre o período do filtro + a janela de comparação.
  const fetchWindow = useMemo(() => {
    const all = [...baseDays, ...cmpDays].sort();
    return { start: all[0], end: all[all.length - 1] };
  }, [baseDays, cmpDays]);

  const { data: realizadas = [] } = useQuery<RealizadaRow[]>({
    queryKey: ["conv-hora-realizadas", fetchWindow.start, fetchWindow.end, closerId ?? null],
    queryFn: async () => {
      const PAGE = 1000;
      const all: RealizadaRow[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from("agendamentos")
          .select("id, scheduled_date, scheduled_time")
          .eq("status", "realizada")
          .is("deleted_at", null)
          .gte("scheduled_date", fetchWindow.start)
          .lte("scheduled_date", fetchWindow.end)
          .order("scheduled_date", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (closerId) q = q.eq("closer_id", closerId);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as RealizadaRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: vendasHora = [] } = useQuery<VendaHoraRow[]>({
    queryKey: ["conv-hora-vendas", fetchWindow.start, fetchWindow.end, closerId ?? null],
    queryFn: async () => {
      const PAGE = 1000;
      const all: VendaHoraRow[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from("vendas")
          .select(
            "agendamento_id, venda_origem, segunda_reuniao, agendamentos!inner(scheduled_date, scheduled_time, status, deleted_at, closer_id)",
          )
          .eq("vendeu", true)
          .eq("agendamentos.status", "realizada")
          .is("agendamentos.deleted_at", null)
          .gte("agendamentos.scheduled_date", fetchWindow.start)
          .lte("agendamentos.scheduled_date", fetchWindow.end)
          .range(offset, offset + PAGE - 1);
        if (closerId) q = q.eq("agendamentos.closer_id", closerId);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as any[];
        all.push(
          ...batch
            // Apenas vendas de 1ª call (venda_origem nulo = legado, tratado como 1ª call).
            .filter((v) => (v.venda_origem ?? "primeira_call") !== "follow_up" && !v.segunda_reuniao)
            .map((v) => ({
              agendamento_id: v.agendamento_id,
              scheduled_date: v.agendamentos?.scheduled_date,
              scheduled_time: v.agendamentos?.scheduled_time,
            })),
        );
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  /**
   * Diagnóstico (não entra no cálculo): vendas do período cujas reuniões ainda
   * não estão marcadas como "realizada", vendas de follow-up e vendas fechadas
   * no período mas de reuniões de outros dias — para conciliar com o card
   * "Vendas registradas".
   */
  const { data: diag } = useQuery({
    queryKey: ["conv-hora-diag", fetchWindow.start, fetchWindow.end, closerId ?? null],
    queryFn: async () => {
      const PAGE = 1000;
      const rows: any[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from("vendas")
          .select(
            "venda_origem, segunda_reuniao, agendamentos!inner(scheduled_date, status, deleted_at, closer_id)",
          )
          .eq("vendeu", true)
          .is("agendamentos.deleted_at", null)
          .gte("agendamentos.scheduled_date", fetchWindow.start)
          .lte("agendamentos.scheduled_date", fetchWindow.end)
          .range(offset, offset + PAGE - 1);
        if (closerId) q = q.eq("agendamentos.closer_id", closerId);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as any[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      return rows;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const diagCounts = useMemo(() => {
    let pendentes = 0;
    let followUps = 0;
    (diag ?? []).forEach((v) => {
      const date = v.agendamentos?.scheduled_date;
      if (!date || !baseDays.has(date)) return;
      const isFollow = (v.venda_origem ?? "primeira_call") === "follow_up" || v.segunda_reuniao;
      if (isFollow) {
        followUps += 1;
        return;
      }
      if (v.agendamentos?.status !== "realizada") pendentes += 1;
    });
    return { pendentes, followUps };
  }, [diag, baseDays]);



  const { data, totals } = useMemo(() => {
    const mk = () => new Map<number, number>();
    const baseReu = mk();
    const baseVen = mk();
    const cmpReu = mk();
    const cmpVen = mk();

    const bump = (m: Map<number, number>, h: number) => m.set(h, (m.get(h) || 0) + 1);

    realizadas.forEach((a) => {
      const h = hourOf(a.scheduled_time);
      if (h == null) return;
      if (baseDays.has(a.scheduled_date)) bump(baseReu, h);
      if (cmpDays.has(a.scheduled_date)) bump(cmpReu, h);
    });

    vendasHora.forEach((v) => {
      const h = hourOf(v.scheduled_time);
      if (h == null || !v.scheduled_date) return;
      if (baseDays.has(v.scheduled_date)) bump(baseVen, h);
      if (cmpDays.has(v.scheduled_date)) bump(cmpVen, h);
    });

    let accReu = 0;
    let accVen = 0;
    let accCmpReu = 0;
    let accCmpVen = 0;

    const rows = HOURS.map((h) => {
      const reu = baseReu.get(h) || 0;
      const ven = baseVen.get(h) || 0;
      const cReu = (cmpReu.get(h) || 0) / cmpDivisor;
      const cVen = (cmpVen.get(h) || 0) / cmpDivisor;
      accReu += reu;
      accVen += ven;
      accCmpReu += cReu;
      accCmpVen += cVen;

      const showReu = cumulative ? accReu : reu;
      const showVen = cumulative ? accVen : ven;
      const showCmpReu = cumulative ? accCmpReu : cReu;
      const showCmpVen = cumulative ? accCmpVen : cVen;

      return {
        hour: `${String(h).padStart(2, "0")}h`,
        realizadas: showReu,
        vendas: showVen,
        conv: showReu > 0 ? Number(((showVen / showReu) * 100).toFixed(1)) : 0,
        cmpReuniões: Number(showCmpReu.toFixed(1)),
        convCmp: showCmpReu > 0 ? Number(((showCmpVen / showCmpReu) * 100).toFixed(1)) : 0,
        hasReu: showReu > 0,
      };
    });

    return {
      data: rows,
      totals: {
        realizadas: accReu,
        vendas: accVen,
        conv: accReu > 0 ? (accVen / accReu) * 100 : 0,
        cmpRealizadas: accCmpReu,
        cmpVendas: accCmpVen,
        convCmp: accCmpReu > 0 ? (accCmpVen / accCmpReu) * 100 : 0,
      },
    };
  }, [realizadas, vendasHora, baseDays, cmpDays, cmpDivisor, cumulative]);

  const delta = totals.conv - totals.convCmp;

  const highlights = useMemo(() => {
    if (cumulative) return null;
    const withReu = data.filter((r) => r.hasReu);
    if (withReu.length === 0) return null;
    const sorted = [...withReu].sort((a, b) => b.conv - a.conv || b.vendas - a.vendas);
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [data, cumulative]);

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Conversão por hora — {periodLabel}</h3>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : delta < 0
                ? "text-destructive border-destructive/30 bg-destructive/10"
                : "text-muted-foreground border-border bg-muted/40",
          )}
          title={`Período: ${totals.vendas}/${totals.realizadas} · Comparação: ${totals.cmpVendas.toFixed(1)}/${totals.cmpRealizadas.toFixed(1)}`}
        >
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {totals.conv.toFixed(1)}% ({delta > 0 ? "+" : ""}
          {delta.toFixed(1)} p.p. vs {cmpMode === "prev" ? "período anterior" : cmpColumnLabel.toLowerCase()})
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
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <Button
              variant={cumulative ? "ghost" : "default"}
              size="sm"
              className="h-7 text-xs px-2 rounded-none"
              onClick={() => setCumulative(false)}
            >
              Hora a hora
            </Button>
            <Button
              variant={cumulative ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2 rounded-none"
              onClick={() => setCumulative(true)}
            >
              Acumulado
            </Button>
          </div>

        </div>
      </div>

      {diagCounts.pendentes > 0 && (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
          title={`Vendas de 1ª call aguardando status "realizada": ${diagCounts.pendentes}. Vendas de follow-up/2ª reunião no período (fora deste card): ${diagCounts.followUps}. Vendas fechadas hoje de reuniões de outros dias aparecem no dia da reunião.`}
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {diagCounts.pendentes === 1
              ? "1 venda de 1ª call ainda não entra no cálculo"
              : `${diagCounts.pendentes} vendas de 1ª call ainda não entram no cálculo`}{" "}
            porque a reunião não está marcada como <strong>realizada</strong>. Elas entram automaticamente
            quando o closer atualizar o status.
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Vendas de 1ª call em reuniões marcadas como <strong>realizadas</strong>, pela hora da reunião (BRT).

        A conversão de cada hora é vendas ÷ reuniões realizadas naquela hora. Comparação:{" "}
        {cmpMode === "prev" ? `período anterior equivalente (${cmpLabel})` : cmpLabel}.
        {!isSingleDay && " Comparação por dia da semana disponível apenas com um único dia selecionado."}
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} interval={0} />
            <YAxis yAxisId="left" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              unit="%"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
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
            <Bar
              yAxisId="left"
              dataKey="realizadas"
              name="Reuniões realizadas"
              fill="hsl(var(--muted-foreground))"
              fillOpacity={0.35}
              radius={[6, 6, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="vendas"
              name="Vendas"
              fill="hsl(var(--primary))"
              fillOpacity={0.9}
              radius={[6, 6, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conv"
              name="Conversão %"
              stroke="hsl(142 71% 45%)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="convCmp"
              name={cmpMode === "prev" ? `Conversão % — período anterior (${cmpLabel})` : `Conversão % — ${cmpLabel}`}
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
            Melhor hora: <strong>{highlights.best.hour}</strong> — {highlights.best.vendas}/
            {highlights.best.realizadas} ({highlights.best.conv.toFixed(1)}%)
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
            Pior hora: <strong>{highlights.worst.hour}</strong> — {highlights.worst.vendas}/
            {highlights.worst.realizadas} ({highlights.worst.conv.toFixed(1)}%)
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-1">Hora</th>
              <th className="text-right font-medium py-1">{cumulative ? "Realizadas (acum.)" : "Realizadas"}</th>
              <th className="text-right font-medium py-1">{cumulative ? "Vendas (acum.)" : "Vendas"}</th>

              <th className="text-right font-medium py-1">Conversão</th>
              <th className="text-right font-medium py-1" title={cmpLabel}>{cmpColumnLabel}</th>
              <th className="text-right font-medium py-1">Δ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const diff = r.conv - r.convCmp;
              return (
                <tr key={r.hour} className="border-t border-border/50">
                  <td className="py-1">{r.hour}</td>
                  <td className="py-1 text-right">{r.realizadas}</td>
                  <td className="py-1 text-right font-semibold">{r.vendas}</td>
                  <td className="py-1 text-right font-semibold">
                    {r.hasReu ? `${r.conv.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-1 text-right text-muted-foreground">
                    {r.cmpReuniões > 0 ? `${r.convCmp.toFixed(1)}%` : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-1 text-right font-semibold",
                      diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {r.hasReu && r.cmpReuniões > 0 ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} p.p.` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border">
              <td className="py-1 font-semibold">Total</td>
              <td className="py-1 text-right font-bold">{totals.realizadas}</td>
              <td className="py-1 text-right font-bold">{totals.vendas}</td>
              <td className="py-1 text-right font-bold">{totals.conv.toFixed(1)}%</td>
              <td className="py-1 text-right text-muted-foreground">{totals.convCmp.toFixed(1)}%</td>
              <td className="py-1 text-right font-bold">
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)} p.p.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
