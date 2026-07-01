import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import SDRErrorDetailsDrawer from "./SDRErrorDetailsDrawer";
import { SdrTeamBadge, type SdrTeam } from "@/components/sdr/SdrTeamBadge";
import { SdrTeamFilter, type SdrTeamFilterValue } from "@/components/sdr/SdrTeamFilter";

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

interface ErrorItem {
  key: string;
  source: "venda" | "agendamento";
  agendamentoId: string;
  sdrId: string | null;
  leadName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  description?: string | null;
}

interface VendaRow {
  id: string;
  agendamento_id: string;
  agendamentos: {
    sdr_responsavel_id: string | null;
    created_by: string | null;
    scheduled_date: string;
    scheduled_time: string | null;
    lead_name: string;
  } | null;
}

interface AgendamentoErrRow {
  id: string;
  sdr_responsavel_id: string | null;
  created_by: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  lead_name: string;
  sdr_error_description: string | null;
}

export default function ErrosSDRTab({ currentDate, dateRange }: Props) {
  const [detailsAgendamentoId, setDetailsAgendamentoId] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<SdrTeamFilterValue>("all");

  const isRange = !!(dateRange?.from && dateRange?.to);
  const fromStr = isRange
    ? format(dateRange!.from!, "yyyy-MM-dd")
    : format(currentDate, "yyyy-MM-dd");
  const toStr = isRange
    ? format(dateRange!.to!, "yyyy-MM-dd")
    : format(currentDate, "yyyy-MM-dd");


  const { data: vendas = [] } = useQuery<VendaRow[]>({
    queryKey: ["sdr-errors", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(
          "id, agendamento_id, agendamentos!inner(sdr_responsavel_id, created_by, scheduled_date, scheduled_time, lead_name)"
        )
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
        .select(
          "id, sdr_responsavel_id, created_by, scheduled_date, scheduled_time, lead_name, sdr_error_description"
        )
        .eq("sdr_error", true)
        .gte("scheduled_date", fromStr)
        .lte("scheduled_date", toStr);
      if (error) throw error;
      return (data ?? []) as AgendamentoErrRow[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const unified = useMemo<ErrorItem[]>(() => {
    const seenAgend = new Set<string>();
    const items: ErrorItem[] = [];
    vendas.forEach((v) => {
      seenAgend.add(v.agendamento_id);
      items.push({
        key: `venda:${v.id}`,
        source: "venda",
        agendamentoId: v.agendamento_id,
        sdrId: v.agendamentos?.sdr_responsavel_id ?? v.agendamentos?.created_by ?? null,
        leadName: v.agendamentos?.lead_name ?? "—",
        scheduledDate: v.agendamentos?.scheduled_date ?? "",
        scheduledTime: v.agendamentos?.scheduled_time ?? null,
      });
    });
    agendErrs.forEach((a) => {
      if (seenAgend.has(a.id)) return;
      items.push({
        key: `agendamento:${a.id}`,
        source: "agendamento",
        agendamentoId: a.id,
        sdrId: a.sdr_responsavel_id ?? a.created_by ?? null,
        leadName: a.lead_name,
        scheduledDate: a.scheduled_date,
        scheduledTime: a.scheduled_time,
        description: a.sdr_error_description,
      });
    });
    return items;
  }, [vendas, agendErrs]);

  const sdrIds = useMemo(() => {
    const ids = new Set<string>();
    unified.forEach((u) => u.sdrId && ids.add(u.sdrId));
    return Array.from(ids);
  }, [unified]);

  const { data: profiles = [] } = useQuery<{ user_id: string; full_name: string; sdr_team: SdrTeam | null }[]>({
    queryKey: ["sdr-error-profiles", sdrIds.sort().join(",")],
    enabled: sdrIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, sdr_team")
        .in("user_id", sdrIds);
      return (data ?? []) as any[];
    },
  });

  const nameOf = (id: string | null) =>
    (id && profiles.find((p) => p.user_id === id)?.full_name) || "Sem SDR";

  const groups = useMemo(() => {
    const map = new Map<string, { sdrId: string | null; name: string; items: ErrorItem[] }>();
    unified.forEach((i) => {
      const k = i.sdrId ?? "__none__";
      if (!map.has(k)) map.set(k, { sdrId: i.sdrId, name: nameOf(i.sdrId), items: [] });
      map.get(k)!.items.push(i);
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unified, profiles]);

  const periodLabel = `${format(new Date(fromStr), "dd/MM/yyyy")} a ${format(new Date(toStr), "dd/MM/yyyy")}`;
  const totalErros = unified.length;
  const sdrsDistintos = new Set(unified.map((u) => u.sdrId).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-xl font-bold">Erros de SDR — {periodLabel}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Total de erros</p>
          <p className="text-3xl font-bold mt-1">{totalErros}</p>
          <p className="text-xs text-muted-foreground mt-1">Apontados pelo Closer no período</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">SDRs com erros</p>
          <p className="text-3xl font-bold mt-1">{sdrsDistintos}</p>
          <p className="text-xs text-muted-foreground mt-1">SDRs distintos</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card p-4">
        {groups.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">
            Nenhum erro de SDR apontado no período
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {groups.map((g) => (
              <AccordionItem key={g.sdrId ?? "none"} value={g.sdrId ?? "none"}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-3">
                    <span className="font-medium">{g.name}</span>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                      {g.items.length} {g.items.length === 1 ? "erro" : "erros"}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="divide-y divide-primary/5 border-t border-primary/5">
                    {g.items.map((item) => (
                      <div key={item.key} className="py-3 px-1 space-y-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setDetailsAgendamentoId(item.agendamentoId)}
                            className="text-sm font-medium truncate text-left hover:underline focus-visible:underline focus:outline-none"
                          >
                            {item.leadName}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {item.scheduledDate
                              ? format(new Date(item.scheduledDate + "T12:00:00"), "dd/MM/yyyy")
                              : "—"}
                            {item.scheduledTime ? ` às ${item.scheduledTime}` : ""}
                          </p>
                        </div>
                        {item.description && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                              Descrição do erro
                            </p>
                            <p className="text-xs whitespace-pre-wrap break-words">{item.description}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      <SDRErrorDetailsDrawer
        open={!!detailsAgendamentoId}
        onOpenChange={(o) => !o && setDetailsAgendamentoId(null)}
        agendamentoId={detailsAgendamentoId}
      />
    </div>
  );
}
