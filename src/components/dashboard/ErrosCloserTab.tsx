import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
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

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

interface ReviewRow {
  id: string;
  agendamento_id: string;
  closer_id: string | null;
  classification: "closer_error" | "acerto";
  error_description: string | null;
  error_category: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
}

interface Item extends ReviewRow {
  leadName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  explicacao: string | null;
}

export default function ErrosCloserTab({ currentDate, dateRange }: Props) {
  const [detailsAgendamentoId, setDetailsAgendamentoId] = useState<string | null>(null);

  const isRange = !!(dateRange?.from && dateRange?.to);
  const fromStr = isRange
    ? format(dateRange!.from!, "yyyy-MM-dd")
    : format(startOfMonth(currentDate), "yyyy-MM-dd");
  const toStr = isRange
    ? format(dateRange!.to!, "yyyy-MM-dd")
    : format(endOfMonth(currentDate), "yyyy-MM-dd");

  const { data: reviews = [] } = useQuery<ReviewRow[]>({
    queryKey: ["closer-error-reviews", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("closer_error_reviews")
        .select("id, agendamento_id, closer_id, classification, error_description, error_category, reviewed_by, reviewed_at")
        .eq("classification", "closer_error")
        .gte("reviewed_at", fromStr + "T00:00:00")
        .lte("reviewed_at", toStr + "T23:59:59");
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const agendamentoIds = useMemo(() => reviews.map((r) => r.agendamento_id), [reviews]);

  const { data: agendamentos = [] } = useQuery<
    { id: string; lead_name: string; scheduled_date: string; scheduled_time: string | null }[]
  >({
    queryKey: ["closer-error-agendamentos", agendamentoIds.sort().join(",")],
    enabled: agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, lead_name, scheduled_date, scheduled_time")
        .in("id", agendamentoIds);
      return data ?? [];
    },
  });

  const { data: vendasRows = [] } = useQuery<
    { agendamento_id: string; explicacao_nao_fechamento: string | null }[]
  >({
    queryKey: ["closer-error-vendas", agendamentoIds.sort().join(",")],
    enabled: agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("agendamento_id, explicacao_nao_fechamento")
        .in("agendamento_id", agendamentoIds);
      return data ?? [];
    },
  });

  const closerIds = useMemo(() => {
    const s = new Set<string>();
    reviews.forEach((r) => r.closer_id && s.add(r.closer_id));
    return Array.from(s);
  }, [reviews]);

  const { data: closers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["closer-error-closers", closerIds.sort().join(",")],
    enabled: closerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").in("id", closerIds);
      return data ?? [];
    },
  });

  const closerMap = useMemo(() => new Map(closers.map((c) => [c.id, c.name])), [closers]);
  const agMap = useMemo(() => new Map(agendamentos.map((a) => [a.id, a])), [agendamentos]);
  const vendaMap = useMemo(() => new Map(vendasRows.map((v) => [v.agendamento_id, v])), [vendasRows]);

  const items = useMemo<Item[]>(() => {
    return reviews.map((r) => {
      const ag = agMap.get(r.agendamento_id);
      const vd = vendaMap.get(r.agendamento_id);
      return {
        ...r,
        leadName: ag?.lead_name ?? "—",
        scheduledDate: ag?.scheduled_date ?? "",
        scheduledTime: ag?.scheduled_time ?? null,
        explicacao: vd?.explicacao_nao_fechamento ?? null,
      };
    });
  }, [reviews, agMap, vendaMap]);

  const groups = useMemo(() => {
    const map = new Map<string, { closerId: string | null; name: string; items: Item[] }>();
    items.forEach((i) => {
      const k = i.closer_id ?? "__none__";
      if (!map.has(k))
        map.set(k, {
          closerId: i.closer_id,
          name: (i.closer_id && closerMap.get(i.closer_id)) || "Sem Closer",
          items: [],
        });
      map.get(k)!.items.push(i);
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [items, closerMap]);

  const periodLabel = `${format(new Date(fromStr), "dd/MM/yyyy")} a ${format(new Date(toStr), "dd/MM/yyyy")}`;
  const totalErros = items.length;
  const closersDistintos = new Set(items.map((i) => i.closer_id).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-500" />
        <h2 className="text-xl font-bold">Erros de Closer — {periodLabel}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Total de erros</p>
          <p className="text-3xl font-bold mt-1">{totalErros}</p>
          <p className="text-xs text-muted-foreground mt-1">Apontados pelo gestor no período</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Closers com erros</p>
          <p className="text-3xl font-bold mt-1">{closersDistintos}</p>
          <p className="text-xs text-muted-foreground mt-1">Closers distintos</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card p-4">
        {groups.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">
            Nenhum erro de Closer apontado no período
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {groups.map((g) => (
              <AccordionItem key={g.closerId ?? "none"} value={g.closerId ?? "none"}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-3">
                    <span className="font-medium">{g.name}</span>
                    <Badge variant="outline" className="border-rose-500/40 text-rose-600">
                      {g.items.length} {g.items.length === 1 ? "erro" : "erros"}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="divide-y divide-primary/5 border-t border-primary/5">
                    {g.items.map((item) => (
                      <div key={item.id} className="py-3 px-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => setDetailsAgendamentoId(item.agendamento_id)}
                              className="text-sm font-medium truncate text-left hover:underline focus:outline-none"
                            >
                              {item.leadName}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {item.scheduledDate
                                ? format(new Date(item.scheduledDate + "T12:00:00"), "dd/MM/yyyy")
                                : "—"}
                              {item.scheduledTime ? ` às ${item.scheduledTime}` : ""}
                              {" · Apontado em "}
                              {format(new Date(item.reviewed_at), "dd/MM/yyyy")}
                            </p>
                          </div>
                          {item.error_category && (
                            <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/15 shrink-0">
                              {item.error_category}
                            </Badge>
                          )}
                        </div>

                        {item.error_description && (
                          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 mb-1">
                              Descrição do erro
                            </p>
                            <p className="text-xs whitespace-pre-wrap break-words">
                              {item.error_description}
                            </p>
                          </div>
                        )}
                        {item.explicacao && (
                          <div className="rounded-md border border-border/60 bg-muted/40 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 mb-1">
                              Explicação do Closer (porquê não fechou)
                            </p>
                            <p className="text-xs whitespace-pre-wrap break-words">{item.explicacao}</p>
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
