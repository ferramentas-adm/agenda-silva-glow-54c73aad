import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AlertTriangle, Check, Loader2, MessageSquare, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import SDRErrorDetailsDrawer from "./SDRErrorDetailsDrawer";

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

type TabKey = "pendentes" | "feedback";

interface ReviewRow {
  id: string;
  agendamento_id: string;
  closer_id: string | null;
  classification: "closer_error" | "acerto";
  error_description: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
  feedback_given: boolean;
  feedback_by: string | null;
  feedback_at: string | null;
  feedback_notes: string | null;
}

interface Item extends ReviewRow {
  leadName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  briefing: string | null;
  explicacao: string | null;
}

export default function ErrosCloserTab({ currentDate, dateRange }: Props) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canFeedback = role === "gestor" || role === "moderador";
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [detailsAgendamentoId, setDetailsAgendamentoId] = useState<string | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<Item | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState("");

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
        .select("*")
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
    { id: string; lead_name: string; scheduled_date: string; scheduled_time: string | null; briefing: string | null; closer_id: string | null }[]
  >({
    queryKey: ["closer-error-agendamentos", agendamentoIds.sort().join(",")],
    enabled: agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, lead_name, scheduled_date, scheduled_time, briefing, closer_id")
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

  const userIds = useMemo(() => {
    const s = new Set<string>();
    reviews.forEach((r) => {
      if (r.reviewed_by) s.add(r.reviewed_by);
      if (r.feedback_by) s.add(r.feedback_by);
    });
    return Array.from(s);
  }, [reviews]);

  const { data: profiles = [] } = useQuery<{ user_id: string; full_name: string }[]>({
    queryKey: ["closer-error-profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      return data ?? [];
    },
  });

  const closerMap = useMemo(() => new Map(closers.map((c) => [c.id, c.name])), [closers]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.full_name])), [profiles]);
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
        briefing: ag?.briefing ?? null,
        explicacao: vd?.explicacao_nao_fechamento ?? null,
      };
    });
  }, [reviews, agMap, vendaMap]);

  const pendentes = useMemo(() => items.filter((i) => !i.feedback_given), [items]);
  const dados = useMemo(() => items.filter((i) => i.feedback_given), [items]);

  const groupByCloser = (list: Item[]) => {
    const map = new Map<string, { closerId: string | null; name: string; items: Item[] }>();
    list.forEach((i) => {
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
  };

  const pendentesGrouped = useMemo(() => groupByCloser(pendentes), [pendentes, closerMap]);
  const dadosGrouped = useMemo(() => groupByCloser(dados), [dados, closerMap]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["closer-error-reviews", fromStr, toStr] });
    queryClient.invalidateQueries({ queryKey: ["drilldown-closer-reviews"] });
  };

  const feedbackMutation = useMutation({
    mutationFn: async ({ item, given, notes }: { item: Item; given: boolean; notes?: string }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const payload = given
        ? {
            feedback_given: true,
            feedback_by: userId,
            feedback_at: new Date().toISOString(),
            feedback_notes: notes ?? null,
          }
        : {
            feedback_given: false,
            feedback_by: null,
            feedback_at: null,
            feedback_notes: null,
          };
      const { error } = await (supabase as any)
        .from("closer_error_reviews")
        .update(payload)
        .eq("id", item.id);
      if (error) throw error;
      return given;
    },
    onSuccess: (given) => {
      invalidate();
      toast.success(given ? "Feedback registrado" : "Feedback removido");
      setFeedbackItem(null);
      setFeedbackNotes("");
    },
    onError: (e: unknown) => {
      toast.error("Erro: " + (e instanceof Error ? e.message : "tente novamente"));
    },
  });

  const periodLabel = `${format(new Date(fromStr), "dd/MM/yyyy")} a ${format(new Date(toStr), "dd/MM/yyyy")}`;

  const renderGroups = (
    groups: { closerId: string | null; name: string; items: Item[] }[],
    kind: TabKey,
  ) => {
    if (groups.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-10 text-sm">
          {kind === "pendentes"
            ? "Nenhum erro de Closer pendente de feedback no período"
            : "Nenhum feedback dado no período"}
        </div>
      );
    }
    const badgeClass =
      kind === "pendentes"
        ? "border-rose-500/40 text-rose-600"
        : "border-emerald-500/40 text-emerald-600";
    return (
      <Accordion type="multiple" className="w-full">
        {groups.map((g) => (
          <AccordionItem key={g.closerId ?? "none"} value={g.closerId ?? "none"}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full pr-3">
                <span className="font-medium">{g.name}</span>
                <Badge variant="outline" className={badgeClass}>
                  {g.items.length} {g.items.length === 1 ? "erro" : "erros"}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="divide-y divide-primary/5 border-t border-primary/5 space-y-0">
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
                          {" · Classificado em "}
                          {format(new Date(item.reviewed_at), "dd/MM/yyyy")}
                          {item.reviewed_by
                            ? ` por ${profileMap.get(item.reviewed_by) ?? "—"}`
                            : ""}
                        </p>
                      </div>
                      {canFeedback && (
                        <div className="shrink-0">
                          {kind === "pendentes" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"
                              onClick={() => {
                                setFeedbackItem(item);
                                setFeedbackNotes("");
                              }}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Marcar feedback dado
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                feedbackMutation.mutate({ item, given: false })
                              }
                              disabled={feedbackMutation.isPending}
                            >
                              <Undo2 className="h-4 w-4 mr-1" />
                              Reabrir
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {item.error_description && (
                      <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 mb-1">
                          Erro apontado pelo gestor
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
                    {kind === "feedback" && item.feedback_at && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Feedback dado em {format(new Date(item.feedback_at), "dd/MM/yyyy")}
                        {item.feedback_by
                          ? ` por ${profileMap.get(item.feedback_by) ?? "—"}`
                          : ""}
                        {item.feedback_notes ? ` — ${item.feedback_notes}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  };

  const totalErros = items.length;
  const totalFeedbacks = dados.length;
  const closersDistintos = new Set(items.map((i) => i.closer_id).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-500" />
        <h2 className="text-xl font-bold">Erros de Closer — {periodLabel}</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Erros confirmados</p>
          <p className="text-3xl font-bold mt-1">{totalErros}</p>
          <p className="text-xs text-muted-foreground mt-1">Marcados pelo gestor</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Pendentes de feedback</p>
          <p className="text-3xl font-bold mt-1">{pendentes.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Aguardando moderação</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Feedbacks dados</p>
          <p className="text-3xl font-bold mt-1">{totalFeedbacks}</p>
          <p className="text-xs text-muted-foreground mt-1">Já tratados</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Closers com erros</p>
          <p className="text-3xl font-bold mt-1">{closersDistintos}</p>
          <p className="text-xs text-muted-foreground mt-1">Closers distintos</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="pendentes">
              Pendentes de feedback
              <Badge variant="secondary" className="ml-2">{pendentes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="feedback">
              Feedback dado
              <Badge variant="secondary" className="ml-2">{dados.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pendentes" className="mt-3">
            {renderGroups(pendentesGrouped, "pendentes")}
          </TabsContent>
          <TabsContent value="feedback" className="mt-3">
            {renderGroups(dadosGrouped, "feedback")}
          </TabsContent>
        </Tabs>
      </div>

      <SDRErrorDetailsDrawer
        open={!!detailsAgendamentoId}
        onOpenChange={(o) => !o && setDetailsAgendamentoId(null)}
        agendamentoId={detailsAgendamentoId}
      />

      <Dialog
        open={!!feedbackItem}
        onOpenChange={(o) => {
          if (!o) {
            setFeedbackItem(null);
            setFeedbackNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar feedback como dado</DialogTitle>
            <DialogDescription>
              Confirme que o feedback sobre o erro foi passado ao Closer {feedbackItem?.closer_id ? closerMap.get(feedbackItem.closer_id) ?? "" : ""}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Observações (opcional)"
            value={feedbackNotes}
            onChange={(e) => setFeedbackNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setFeedbackItem(null);
                setFeedbackNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                feedbackItem &&
                feedbackMutation.mutate({
                  item: feedbackItem,
                  given: true,
                  notes: feedbackNotes.trim() || undefined,
                })
              }
              disabled={feedbackMutation.isPending}
            >
              {feedbackMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
