import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneForwarded, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";

interface Props {
  /** Período efetivo (yyyy-MM-dd) já resolvido pela aba Produtividade SDR. */
  range: { from: string; to: string } | null;
}

interface Row {
  channel: string;
  qtd_created: number;
  qtd_realizada: number;
  qtd_vendas: number;
  ids_created: string[];
  ids_realizada: string[];
  ids_vendas: string[];
}

/**
 * Quadro "Por canal do agendamento" — WhatsApp (CRM) vs Ligação API4COM.
 *
 * Agregação server-side via RPC `dashboard_agendamentos_por_booking_channel`
 * (base: data de criação em America/Sao_Paulo). Só entram agendamentos com
 * `booking_channel` preenchido — ou seja, criados a partir da ativação do
 * campo obrigatório na tela de agendamento.
 */
export default function BookingChannelPanel({ range }: Props) {
  const [drill, setDrill] = useState<{ open: boolean; title: string; ids: string[] }>({
    open: false,
    title: "",
    ids: [],
  });

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["booking-channel-panel", range?.from, range?.to],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_agendamentos_por_booking_channel", {
        _from: range!.from,
        _to: range!.to,
        _base: "criacao",
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        channel: r.channel as string,
        qtd_created: Number(r.qtd_created) || 0,
        qtd_realizada: Number(r.qtd_realizada) || 0,
        qtd_vendas: Number(r.qtd_vendas) || 0,
        ids_created: (r.ids_created ?? []) as string[],
        ids_realizada: (r.ids_realizada ?? []) as string[],
        ids_vendas: (r.ids_vendas ?? []) as string[],
      }));
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.qtd_created += r.qtd_created;
      acc.qtd_realizada += r.qtd_realizada;
      acc.qtd_vendas += r.qtd_vendas;
      return acc;
    },
    { qtd_created: 0, qtd_realizada: 0, qtd_vendas: 0 },
  );

  const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

  const openDrill = (title: string, ids: string[]) => setDrill({ open: true, title, ids });
  const clickCell = (channel: string, suffix: string, ids: string[]) =>
    ids.length > 0 ? () => openDrill(`Canal do agendamento — ${channel}${suffix}`, ids) : undefined;

  return (
    <>
      <div className="rounded-xl border border-primary/10 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Por canal do agendamento</h3>
          <span className="text-[11px] text-muted-foreground">(conta agendamentos criados a partir da ativação do campo)</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/10 text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium text-xs">Canal</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Agendamentos</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Realizadas</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Vendas</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted-foreground py-4 text-xs">
                      Nenhum agendamento com canal informado no período
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.channel} className="border-b border-primary/5 hover:bg-primary/5 transition-colors">
                    <td className="py-2 px-2 font-medium">{row.channel}</td>
                    <td
                      className={cn("py-2 px-2 text-right font-bold tabular-nums", row.ids_created.length > 0 && "cursor-pointer")}
                      onClick={clickCell(row.channel, " · Agendamentos", row.ids_created)}
                    >
                      {row.qtd_created}
                    </td>
                    <td
                      className={cn("py-2 px-2 text-right tabular-nums", row.ids_realizada.length > 0 && "cursor-pointer")}
                      onClick={clickCell(row.channel, " · Realizadas", row.ids_realizada)}
                    >
                      {row.qtd_realizada}
                    </td>
                    <td
                      className={cn("py-2 px-2 text-right tabular-nums font-semibold", row.ids_vendas.length > 0 && "cursor-pointer")}
                      onClick={clickCell(row.channel, " · Vendas", row.ids_vendas)}
                    >
                      {row.qtd_vendas}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {pct(row.qtd_vendas, row.qtd_realizada)}
                    </td>
                  </tr>
                ))}
                {rows.length > 0 && (
                  <tr className="border-t border-primary/20 bg-muted/20 font-semibold">
                    <td className="py-2 px-2 text-xs uppercase text-muted-foreground">Total</td>
                    <td className="py-2 px-2 text-right tabular-nums">{totals.qtd_created}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{totals.qtd_realizada}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{totals.qtd_vendas}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {pct(totals.qtd_vendas, totals.qtd_realizada)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
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
