import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, subDays, addDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Users, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";

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

interface CanalRow {
  channel: string;
  qtd_scheduled: number;
  qtd_scheduled_realizada: number;
  qtd_created: number;
  qtd_created_realizada: number;
  ids_scheduled: string[];
  ids_scheduled_realizada: string[];
  ids_created: string[];
  ids_created_realizada: string[];
}

/**
 * Painel "Agendas por Canal" — usado dentro da aba de Vendas.
 *
 * Agregação server-side via RPC `dashboard_agendas_por_canal`:
 * substitui duas varreduras paginadas em `agendamentos` (até milhares
 * de linhas cada) por uma única chamada que já devolve os totais e
 * os ids necessários para drilldown/export.
 */
export default function AgendasPorCanalPanel({ currentDate, dateRange, vendasFechadasNoPeriodo }: Props) {
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

  const { data: canais = [] } = useQuery<CanalRow[]>({
    queryKey: ["vendas-canal-rpc", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_agendas_por_canal", {
        _from: fromStr,
        _to: toStr,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        channel: r.channel as string,
        qtd_scheduled: Number(r.qtd_scheduled) || 0,
        qtd_scheduled_realizada: Number(r.qtd_scheduled_realizada) || 0,
        qtd_created: Number(r.qtd_created) || 0,
        qtd_created_realizada: Number(r.qtd_created_realizada) || 0,
        ids_scheduled: (r.ids_scheduled ?? []) as string[],
        ids_scheduled_realizada: (r.ids_scheduled_realizada ?? []) as string[],
        ids_created: (r.ids_created ?? []) as string[],
        ids_created_realizada: (r.ids_created_realizada ?? []) as string[],
      }));
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  // Vendas agrupadas por canal — usa a lista vinda da VendasTab (que já
  // aplica a data efetiva de fechamento: closed_at, audit de follow-up
  // ou scheduled_date). Assim, uma venda fechada hoje via follow-up de
  // uma reunião antiga aparece sob "Hoje" e não sob a data da reunião
  // original.
  const vendasByChannel = useMemo(() => {
    const m = new Map<string, { ids: string[]; valor: number }>();
    (vendasFechadasNoPeriodo ?? []).forEach((v) => {
      const ch = v.channel_type || "Sem canal";
      const cur = m.get(ch) || { ids: [], valor: 0 };
      cur.ids.push(v.agendamento_id);
      cur.valor += v.valor;
      m.set(ch, cur);
    });
    return m;
  }, [vendasFechadasNoPeriodo]);

  const buildChannels = (mode: "scheduled" | "created") => {
    const map = new Map<string, { ids: string[]; idsRealizadas: string[]; idsVendas: string[]; valorVendas: number }>();
    canais.forEach((c) => {
      const ids = mode === "scheduled" ? c.ids_scheduled : c.ids_created;
      const idsReal = mode === "scheduled" ? c.ids_scheduled_realizada : c.ids_created_realizada;
      if (ids.length === 0 && idsReal.length === 0) return;
      map.set(c.channel, { ids, idsRealizadas: idsReal, idsVendas: [], valorVendas: 0 });
    });
    vendasByChannel.forEach((v, ch) => {
      const cur = map.get(ch) || { ids: [], idsRealizadas: [], idsVendas: [], valorVendas: 0 };
      cur.idsVendas = v.ids;
      cur.valorVendas = v.valor;
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

  const channelsScheduled = useMemo(() => buildChannels("scheduled"), [canais, vendasByChannel]);
  const channelsCreated = useMemo(() => buildChannels("created"), [canais, vendasByChannel]);

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
          exportPrefix={`agendas-para-${fromStr}${fromStr !== toStr ? `_a_${toStr}` : ""}`}
          onRowClick={({ canal, ids, mode }) =>
            openDrill(`${baseLabelPara} — ${canal}${suffix(mode)}`, ids)
          }
        />
        <ChannelTable
          title={criadasTitle}
          data={channelsCreated}
          exportPrefix={`agendas-criadas-${fromStr}${fromStr !== toStr ? `_a_${toStr}` : ""}`}
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
  exportPrefix,
  onRowClick,
}: {
  title: string;
  data: { num: number; canal: string; qtd: number; ids: string[]; qtdRealizadas: number; idsRealizadas: string[]; qtdVendas: number; idsVendas: string[]; valorVendas: number }[];
  exportPrefix: string;
  onRowClick?: (row: { canal: string; ids: string[]; mode: "todas" | "realizadas" | "vendas" }) => void;
}) {
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(
    () => [...data].sort((a, b) => b.qtd - a.qtd).map((r, i) => ({ ...r, num: i + 1 })),
    [data],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.qtd += r.qtd;
        acc.qtdRealizadas += r.qtdRealizadas;
        acc.qtdVendas += r.qtdVendas;
        acc.valorVendas += r.valorVendas;
        return acc;
      },
      { qtd: 0, qtdRealizadas: 0, qtdVendas: 0, valorVendas: 0 },
    );
  }, [rows]);

  const handleExport = async () => {
    const ids = Array.from(new Set(rows.flatMap((r) => r.ids)));
    if (ids.length === 0) {
      toast.info("Nenhum registro para exportar");
      return;
    }
    setExporting(true);
    try {
      const CHUNK = 500;
      type Ag = { id: string; lead_name: string | null; lead_phone: string | null; channel_type: string | null; status: string | null; scheduled_date: string | null };
      type V = { agendamento_id: string; vendeu: boolean | null; valor: number | null; motivo_nao_fechamento: string | null };
      const ags: Ag[] = [];
      const vds: V[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const [{ data: a, error: ea }, { data: v, error: ev }] = await Promise.all([
          supabase.from("agendamentos").select("id, lead_name, lead_phone, channel_type, status, scheduled_date").in("id", slice),
          supabase.from("vendas").select("agendamento_id, vendeu, valor, motivo_nao_fechamento").in("agendamento_id", slice),
        ]);
        if (ea) throw ea;
        if (ev) throw ev;
        ags.push(...((a ?? []) as Ag[]));
        vds.push(...((v ?? []) as V[]));
      }
      const vMap = new Map<string, V>();
      vds.forEach((v) => vMap.set(v.agendamento_id, v));
      const headers = ["Nome do lead", "Telefone", "Canal", "Status", "Data da reunião", "Vendeu", "Valor da venda", "Motivo não fechamento"];
      const esc = (s: unknown) => {
        const str = String(s ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""');
        return `"${str}"`;
      };
      const lines = [headers.map(esc).join(";")];
      ags.forEach((a) => {
        const v = vMap.get(a.id);
        const vendeu = v == null ? "—" : v.vendeu ? "Sim" : "Não";
        const valor = v?.valor != null ? Number(v.valor).toFixed(2).replace(".", ",") : "";
        const data = a.scheduled_date ? a.scheduled_date.split("-").reverse().join("/") : "";
        lines.push([
          a.lead_name ?? "",
          a.lead_phone ?? "",
          a.channel_type ?? "Sem canal",
          a.status ?? "",
          data,
          vendeu,
          valor,
          v?.motivo_nao_fechamento ?? "",
        ].map(esc).join(";"));
      });
      const csv = "\uFEFF" + lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportPrefix}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exportados ${ags.length} registros`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar CSV");
    } finally {
      setExporting(false);
    }
  };

  const fmtMoney = (v: number) =>
    v > 0
      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : "—";
  const pct = (num: number, den: number) =>
    den > 0 ? `${((num / den) * 100).toFixed(0)}%` : "—";

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || rows.length === 0}
          className="h-7 px-2 text-xs gap-1"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Exportar
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10 text-muted-foreground">
              <th className="text-left py-2 px-2 font-medium text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-xs">Canal</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Agendadas</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Realizadas</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Vendas</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Tíquete Médio</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Conversão</th>
              <th className="text-right py-2 px-2 font-medium text-xs">Coletado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum registro
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const clickCell = (mode: "todas" | "realizadas" | "vendas", ids: string[]) =>
                onRowClick && ids.length > 0
                  ? () => onRowClick({ canal: row.canal, ids, mode })
                  : undefined;
              return (
                <tr key={row.canal} className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                  <td className="py-2 px-2 text-muted-foreground">{row.num}</td>
                  <td className="py-2 px-2 font-medium">{row.canal}</td>
                  <td
                    className={cn("py-2 px-2 text-right font-bold tabular-nums", clickCell("todas", row.ids) && "cursor-pointer")}
                    onClick={clickCell("todas", row.ids)}
                  >
                    {row.qtd}
                  </td>
                  <td
                    className={cn("py-2 px-2 text-right tabular-nums", clickCell("realizadas", row.idsRealizadas) && "cursor-pointer")}
                    onClick={clickCell("realizadas", row.idsRealizadas)}
                  >
                    {row.qtdRealizadas}
                  </td>
                  <td
                    className={cn("py-2 px-2 text-right tabular-nums font-semibold", clickCell("vendas", row.idsVendas) && "cursor-pointer")}
                    onClick={clickCell("vendas", row.idsVendas)}
                  >
                    {row.qtdVendas}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {row.qtdVendas > 0 ? fmtMoney(row.valorVendas / row.qtdVendas) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {pct(row.qtdVendas, row.qtdRealizadas)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">
                    {fmtMoney(row.valorVendas)}
                  </td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="border-t border-primary/20 bg-muted/20 font-semibold">
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2 text-xs uppercase text-muted-foreground">Total</td>
                <td className="py-2 px-2 text-right tabular-nums">{totals.qtd}</td>
                <td className="py-2 px-2 text-right tabular-nums">{totals.qtdRealizadas}</td>
                <td className="py-2 px-2 text-right tabular-nums">{totals.qtdVendas}</td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                  {totals.qtdVendas > 0 ? fmtMoney(totals.valorVendas / totals.qtdVendas) : "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                  {pct(totals.qtdVendas, totals.qtdRealizadas)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(totals.valorVendas)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
