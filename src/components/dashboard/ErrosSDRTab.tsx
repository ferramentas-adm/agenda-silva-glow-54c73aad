import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

interface VendaRow {
  agendamento_id: string;
  sdr_error: boolean;
  agendamentos: {
    sdr_responsavel_id: string | null;
    created_by: string | null;
    scheduled_date: string;
  } | null;
}

interface AgendamentoErrRow {
  id: string;
  sdr_responsavel_id: string | null;
  created_by: string | null;
  scheduled_date: string;
}

export default function ErrosSDRTab({ currentDate, dateRange }: Props) {
  const isRange = !!(dateRange?.from && dateRange?.to);
  const fromStr = isRange
    ? format(dateRange!.from!, "yyyy-MM-dd")
    : format(startOfMonth(currentDate), "yyyy-MM-dd");
  const toStr = isRange
    ? format(dateRange!.to!, "yyyy-MM-dd")
    : format(endOfMonth(currentDate), "yyyy-MM-dd");

  const { data: vendas = [] } = useQuery<VendaRow[]>({
    queryKey: ["sdr-errors", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select("agendamento_id, sdr_error, agendamentos!inner(sdr_responsavel_id, created_by, scheduled_date)")
        .eq("sdr_error", true)
        .gte("agendamentos.scheduled_date", fromStr)
        .lte("agendamentos.scheduled_date", toStr);
      if (error) throw error;
      return (data ?? []) as unknown as VendaRow[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: agendErrs = [] } = useQuery<AgendamentoErrRow[]>({
    queryKey: ["sdr-errors-agendamentos", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, sdr_responsavel_id, created_by, scheduled_date")
        .eq("sdr_error", true)
        .is("deleted_at", null)
        .gte("scheduled_date", fromStr)
        .lte("scheduled_date", toStr);
      if (error) throw error;
      return (data ?? []) as AgendamentoErrRow[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  // Unifica fontes (vendas.sdr_error + agendamentos.sdr_error) deduplicando por agendamento_id
  const unified = useMemo(() => {
    const map = new Map<string, { sdrId: string | null }>();
    vendas.forEach((v) => {
      const sdrId = v.agendamentos?.sdr_responsavel_id ?? v.agendamentos?.created_by ?? null;
      map.set(v.agendamento_id, { sdrId });
    });
    agendErrs.forEach((a) => {
      if (map.has(a.id)) return;
      map.set(a.id, { sdrId: a.sdr_responsavel_id ?? a.created_by ?? null });
    });
    return Array.from(map.values());
  }, [vendas, agendErrs]);

  const sdrIds = useMemo(() => {
    const ids = new Set<string>();
    unified.forEach((u) => {
      if (u.sdrId) ids.add(u.sdrId);
    });
    return Array.from(ids);
  }, [unified]);

  const { data: profiles = [] } = useQuery<{ user_id: string; full_name: string }[]>({
    queryKey: ["sdr-error-profiles", sdrIds.sort().join(",")],
    enabled: sdrIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", sdrIds);
      return data ?? [];
    },
  });

  const ranking = useMemo(() => {
    const counts = new Map<string, number>();
    unified.forEach((u) => {
      if (!u.sdrId) return;
      counts.set(u.sdrId, (counts.get(u.sdrId) ?? 0) + 1);
    });
    const nameOf = (id: string) =>
      profiles.find((p) => p.user_id === id)?.full_name ?? "—";
    return Array.from(counts.entries())
      .map(([id, qtd]) => ({ id, name: nameOf(id), qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [unified, profiles]);

  const total = unified.length;
  const periodLabel = `${format(new Date(fromStr), "dd/MM/yyyy")} a ${format(new Date(toStr), "dd/MM/yyyy")}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-xl font-bold">Erros de SDR — {periodLabel}</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Total de erros no período</p>
          <p className="text-3xl font-bold mt-1">{total}</p>
          <p className="text-xs text-muted-foreground mt-1">Reuniões marcadas com erro de SDR</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">SDRs com erros</p>
          <p className="text-3xl font-bold mt-1">{ranking.length}</p>
          <p className="text-xs text-muted-foreground mt-1">SDRs distintos</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Ranking de erros por SDR</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary/10 text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium text-xs">#</th>
                <th className="text-left py-2 px-2 font-medium text-xs">SDR</th>
                <th className="text-right py-2 px-2 font-medium text-xs">Erros</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted-foreground py-6 text-xs">
                    Nenhum erro de SDR registrado no período
                  </td>
                </tr>
              )}
              {ranking.map((r, i) => (
                <tr key={r.id} className="border-b border-primary/5">
                  <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-2 font-medium">{r.name}</td>
                  <td className="py-2 px-2 text-right font-bold text-amber-500">{r.qtd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
