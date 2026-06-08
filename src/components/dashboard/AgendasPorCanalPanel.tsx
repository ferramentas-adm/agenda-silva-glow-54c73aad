import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, subDays, addDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";

interface AgRow {
  id: string;
  scheduled_date: string;
  created_at: string;
  status: string;
  channel_type: string | null;
}

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
  /**
   * Vendas (vendeu=true) já filtradas pela data efetiva de fechamento
   * dentro do período selecionado. Computadas em VendasTab para
   * reaproveitar a mesma lógica de `closingDateOf` (closed_at, audit
   * de follow-up ou scheduled_date). Garante que vendas fechadas em
   * X via follow-up de reuniões antigas contem em X.
   */
  vendasFechadasNoPeriodo?: { agendamento_id: string; channel_type: string | null; valor: number }[];
}

/**
 * Painel "Agendas por Canal" — usado dentro da aba de Vendas.
 *
 * Diferente do painel equivalente em "Métricas SDR" (que filtra apenas
 * agendamentos criados por SDR), aqui são consideradas TODAS as agendas
 * do período, incluindo segundas reuniões criadas pelos closers. Isso é
 * importante para a aba de vendas, onde queremos ver agendadas, realizadas
 * e vendas reais — inclusive vendas de segunda reunião.
 */
export default function AgendasPorCanalPanel({ currentDate, dateRange }: Props) {
  const isRange = !!(dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to));
  const fromStr = isRange ? format(dateRange!.from!, "yyyy-MM-dd") : format(currentDate, "yyyy-MM-dd");
  const toStr = isRange ? format(dateRange!.to!, "yyyy-MM-dd") : format(currentDate, "yyyy-MM-dd");

  const periodLabel = useMemo(() => {
    if (isRange) return `${format(dateRange!.from!, "dd/MM/yyyy")} a ${format(dateRange!.to!, "dd/MM/yyyy")}`;
    const today = new Date();
    if (isSameDay(currentDate, today)) return "Hoje";
    if (isSameDay(currentDate, subDays(today, 1))) return "Ontem";
    if (isSameDay(currentDate, addDays(today, 1))) return "Amanhã";
    return format(currentDate, "dd/MM/yyyy");
  }, [currentDate, isRange, dateRange]);

  // Agendas com scheduled_date dentro do período
  const { data: scheduledAgs = [] } = useQuery<AgRow[]>({
    queryKey: ["vendas-canal-scheduled", fromStr, toStr],
    queryFn: async () => {
      const all: AgRow[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id, scheduled_date, created_at, status, channel_type")
          .is("deleted_at", null)
          .gte("scheduled_date", fromStr)
          .lte("scheduled_date", toStr)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as AgRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  // Agendas criadas dentro do período (BRT) — usa range em created_at com offset -03:00
  const { data: createdAgs = [] } = useQuery<AgRow[]>({
    queryKey: ["vendas-canal-created", fromStr, toStr],
    queryFn: async () => {
      const all: AgRow[] = [];
      const PAGE = 1000;
      let from = 0;
      const startIso = `${fromStr}T00:00:00-03:00`;
      const endIso = `${toStr}T23:59:59-03:00`;
      while (true) {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id, scheduled_date, created_at, status, channel_type")
          .is("deleted_at", null)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as AgRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  const allIds = useMemo(() => {
    const s = new Set<string>();
    scheduledAgs.forEach((a) => s.add(a.id));
    createdAgs.forEach((a) => s.add(a.id));
    return Array.from(s);
  }, [scheduledAgs, createdAgs]);

  const { data: soldVendas = [] } = useQuery<{ agendamento_id: string; valor: number | null }[]>({
    queryKey: ["vendas-canal-sold", allIds.length, allIds[0], allIds[allIds.length - 1]],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const out: { agendamento_id: string; valor: number | null }[] = [];
      const CHUNK = 500;
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendas")
          .select("agendamento_id, valor")
          .eq("vendeu", true)
          .in("agendamento_id", chunk);
        if (error) break;
        (data ?? []).forEach((v) =>
          out.push({ agendamento_id: v.agendamento_id, valor: v.valor }),
        );
      }
      return out;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  const soldSet = useMemo(() => new Set(soldVendas.map((v) => v.agendamento_id)), [soldVendas]);
  const soldValueMap = useMemo(() => {
    const m = new Map<string, number>();
    soldVendas.forEach((v) => m.set(v.agendamento_id, Number(v.valor) || 0));
    return m;
  }, [soldVendas]);

  const byChannel = useMemo(() => {
    return (list: AgRow[]) => {
      const map = new Map<string, { ids: string[]; idsRealizadas: string[]; idsVendas: string[]; valorVendas: number }>();
      list.forEach((a) => {
        const ch = a.channel_type || "Sem canal";
        const cur = map.get(ch) || { ids: [], idsRealizadas: [], idsVendas: [], valorVendas: 0 };
        cur.ids.push(a.id);
        if (a.status === "realizada") cur.idsRealizadas.push(a.id);
        if (soldSet.has(a.id)) {
          cur.idsVendas.push(a.id);
          cur.valorVendas += soldValueMap.get(a.id) || 0;
        }
        map.set(ch, cur);
      });
      return Array.from(map.entries())
        .sort((a, b) => b[1].ids.length - a[1].ids.length)
        .map(([canal, v], i) => ({
          num: i + 1,
          canal,
          qtd: v.ids.length,
          ids: v.ids,
          qtdRealizadas: v.idsRealizadas.length,
          idsRealizadas: v.idsRealizadas,
          qtdVendas: v.idsVendas.length,
          idsVendas: v.idsVendas,
          valorVendas: v.valorVendas,
        }));
    };
  }, [soldSet, soldValueMap]);

  const channelsScheduled = useMemo(() => byChannel(scheduledAgs), [byChannel, scheduledAgs]);
  const channelsCreated = useMemo(() => byChannel(createdAgs), [byChannel, createdAgs]);

  const [drill, setDrill] = useState<{ open: boolean; title: string; ids: string[] }>({ open: false, title: "", ids: [] });
  const openDrill = (title: string, ids: string[]) => setDrill({ open: true, title, ids });

  const paraTitle = `Agendas Para ${periodLabel} — por Canal`;
  const criadasTitle = `Agendas Criadas ${periodLabel} — por Canal`;
  const baseLabelPara = `Agendas Para ${periodLabel}`;
  const baseLabelCriadas = `Agendas Criadas ${periodLabel}`;

  const suffix = (mode: "todas" | "realizadas" | "vendas") =>
    mode === "realizadas" ? " · Realizadas" : mode === "vendas" ? " · Vendas" : "";

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChannelTable
          title={paraTitle}
          data={channelsScheduled}
          onRowClick={({ canal, ids, mode }) =>
            openDrill(`${baseLabelPara} — ${canal}${suffix(mode)}`, ids)
          }
        />
        <ChannelTable
          title={criadasTitle}
          data={channelsCreated}
          onRowClick={({ canal, ids, mode }) =>
            openDrill(`${baseLabelCriadas} — ${canal}${suffix(mode)}`, ids)
          }
        />
      </div>

      <MetricDrilldownDialog
        open={drill.open}
        onOpenChange={(o) => setDrill((d) => ({ ...d, open: o }))}
        title={drill.title}
        agendamentoIds={drill.ids}
      />
    </>
  );
}

// ─── ChannelTable (cópia local do componente usado em Métricas SDR) ──
function ChannelTable({
  title,
  data,
  onRowClick,
}: {
  title: string;
  data: { num: number; canal: string; qtd: number; ids: string[]; qtdRealizadas: number; idsRealizadas: string[]; qtdVendas: number; idsVendas: string[]; valorVendas: number }[];
  onRowClick?: (row: { canal: string; ids: string[]; mode: "todas" | "realizadas" | "vendas" }) => void;
}) {
  const [mode, setMode] = useState<"todas" | "realizadas" | "vendas">("todas");

  const rows = useMemo(() => {
    const mapped = data.map((r) => ({
      ...r,
      currentQtd: mode === "todas" ? r.qtd : mode === "realizadas" ? r.qtdRealizadas : r.qtdVendas,
      currentIds: mode === "todas" ? r.ids : mode === "realizadas" ? r.idsRealizadas : r.idsVendas,
    }));
    const filtered = mode !== "todas" ? mapped.filter((r) => r.currentQtd > 0) : mapped;
    return filtered
      .sort((a, b) => b.currentQtd - a.currentQtd)
      .map((r, i) => ({ ...r, num: i + 1 }));
  }, [data, mode]);

  const showTaxa = mode !== "todas";
  const tabBtn = (key: "todas" | "realizadas" | "vendas", label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={cn(
        "px-2.5 py-1 text-xs rounded transition-colors",
        mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="inline-flex rounded-md border border-primary/10 p-0.5 bg-muted/30">
          {tabBtn("todas", "Todas")}
          {tabBtn("realizadas", "Realizadas")}
          {tabBtn("vendas", "Vendas")}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-muted-foreground">
              <th className="text-left py-2 px-2 font-medium text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-xs">Canal</th>
              <th className="text-right py-2 px-2 font-medium text-xs">
                {mode === "vendas" ? "Vendas" : "Qtd"}
              </th>
              {mode === "vendas" && (
                <th className="text-right py-2 px-2 font-medium text-xs">Valor</th>
              )}
              {showTaxa && (
                <th className="text-right py-2 px-2 font-medium text-xs">Taxa</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3 + (mode === "vendas" ? 1 : 0) + (showTaxa ? 1 : 0)} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum registro
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.canal}
                className={cn(
                  "border-b border-primary/5",
                  onRowClick && "cursor-pointer hover:bg-primary/5 transition-colors",
                )}
                onClick={onRowClick ? () => onRowClick({ canal: row.canal, ids: row.currentIds, mode }) : undefined}
              >
                <td className="py-2 px-2 text-muted-foreground">{row.num}</td>
                <td className="py-2 px-2 font-medium">{row.canal}</td>
                <td className="py-2 px-2 text-right font-bold">{row.currentQtd}</td>
                {mode === "vendas" && (
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">
                    {row.valorVendas > 0
                      ? row.valorVendas.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
                      : "—"}
                  </td>
                )}
                {showTaxa && (
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {row.qtd > 0
                      ? `${(((mode === "realizadas" ? row.qtdRealizadas : row.qtdVendas) / row.qtd) * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
