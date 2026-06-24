import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AlertTriangle, Check, Loader2, ShieldCheck, Undo2 } from "lucide-react";
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
import { toast } from "sonner";
import SDRErrorDetailsDrawer from "./SDRErrorDetailsDrawer";

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

type Source = "venda" | "agendamento";
type Outcome = "confirmed" | "dismissed" | null;
type TabKey = "pendentes" | "confirmados" | "qualificados";

interface ErrorItem {
  key: string;
  source: Source;
  id: string;
  agendamentoId: string;
  sdrId: string | null;
  leadName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  outcome: Outcome;
}

interface VendaRow {
  id: string;
  agendamento_id: string;
  sdr_error: boolean;
  sdr_error_reviewed_at: string | null;
  sdr_error_reviewed_by: string | null;
  sdr_error_outcome: Outcome;
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
  sdr_error_reviewed_at: string | null;
  sdr_error_reviewed_by: string | null;
  sdr_error_outcome: Outcome;
}

export default function ErrosSDRTab({ currentDate, dateRange }: Props) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canReview = role === "gestor" || role === "moderador";
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [detailsAgendamentoId, setDetailsAgendamentoId] = useState<string | null>(null);

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
        .select(
          "id, agendamento_id, sdr_error, sdr_error_reviewed_at, sdr_error_reviewed_by, sdr_error_outcome, agendamentos!inner(sdr_responsavel_id, created_by, scheduled_date, scheduled_time, lead_name)"
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
          "id, sdr_responsavel_id, created_by, scheduled_date, scheduled_time, lead_name, sdr_error_reviewed_at, sdr_error_reviewed_by, sdr_error_outcome"
        )
        .eq("sdr_error", true)
        .is("deleted_at", null)
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
        id: v.id,
        agendamentoId: v.agendamento_id,
        sdrId: v.agendamentos?.sdr_responsavel_id ?? v.agendamentos?.created_by ?? null,
        leadName: v.agendamentos?.lead_name ?? "—",
        scheduledDate: v.agendamentos?.scheduled_date ?? "",
        scheduledTime: v.agendamentos?.scheduled_time ?? null,
        reviewedAt: v.sdr_error_reviewed_at,
        reviewedBy: v.sdr_error_reviewed_by,
        outcome: v.sdr_error_outcome,
      });
    });
    agendErrs.forEach((a) => {
      if (seenAgend.has(a.id)) return;
      items.push({
        key: `agendamento:${a.id}`,
        source: "agendamento",
        id: a.id,
        agendamentoId: a.id,
        sdrId: a.sdr_responsavel_id ?? a.created_by ?? null,
        leadName: a.lead_name,
        scheduledDate: a.scheduled_date,
        scheduledTime: a.scheduled_time,
        reviewedAt: a.sdr_error_reviewed_at,
        reviewedBy: a.sdr_error_reviewed_by,
        outcome: a.sdr_error_outcome,
      });
    });
    return items;
  }, [vendas, agendErrs]);

  const sdrIds = useMemo(() => {
    const ids = new Set<string>();
    unified.forEach((u) => {
      if (u.sdrId) ids.add(u.sdrId);
      if (u.reviewedBy) ids.add(u.reviewedBy);
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

  const nameOf = (id: string | null) =>
    (id && profiles.find((p) => p.user_id === id)?.full_name) || "Sem SDR";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sdr-errors", fromStr, toStr] });
    queryClient.invalidateQueries({ queryKey: ["sdr-errors-agendamentos", fromStr, toStr] });
  };

  const decideMutation = useMutation({
    mutationFn: async ({ item, outcome }: { item: ErrorItem; outcome: Outcome }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const payload =
        outcome === null
          ? {
              sdr_error_reviewed_at: null,
              sdr_error_reviewed_by: null,
              sdr_error_outcome: null,
            }
          : {
              sdr_error_reviewed_at: new Date().toISOString(),
              sdr_error_reviewed_by: userId,
              sdr_error_outcome: outcome,
            };
      const table = item.source === "venda" ? "vendas" : "agendamentos";
      const { error } = await supabase.from(table).update(payload).eq("id", item.id);
      if (error) throw error;
      return outcome;
    },
    onSuccess: (outcome) => {
      invalidate();
      if (outcome === "confirmed") toast.success("Erro confirmado", { description: "Movido para Erros confirmados." });
      else if (outcome === "dismissed") toast.success("SDR acertou", { description: "Movido para Qualificados corretamente." });
      else toast.success("Item reaberto", { description: "Voltou para Pendentes." });
    },
    onError: (e: unknown) => {
      toast.error("Erro na ação", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    },
  });

  const pendentes = useMemo(() => unified.filter((u) => !u.reviewedAt), [unified]);
  const confirmados = useMemo(
    () => unified.filter((u) => !!u.reviewedAt && u.outcome !== "dismissed"),
    [unified]
  );
  const qualificados = useMemo(
    () => unified.filter((u) => !!u.reviewedAt && u.outcome === "dismissed"),
    [unified]
  );

  const groupBySdr = (items: ErrorItem[]) => {
    const map = new Map<string, { sdrId: string | null; name: string; items: ErrorItem[] }>();
    items.forEach((i) => {
      const k = i.sdrId ?? "__none__";
      if (!map.has(k)) map.set(k, { sdrId: i.sdrId, name: nameOf(i.sdrId), items: [] });
      map.get(k)!.items.push(i);
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  };

  const pendentesGrouped = useMemo(() => groupBySdr(pendentes), [pendentes, profiles]);
  const confirmadosGrouped = useMemo(() => groupBySdr(confirmados), [confirmados, profiles]);
  const qualificadosGrouped = useMemo(() => groupBySdr(qualificados), [qualificados, profiles]);

  const periodLabel = `${format(new Date(fromStr), "dd/MM/yyyy")} a ${format(new Date(toStr), "dd/MM/yyyy")}`;

  const isBusy = (item: ErrorItem) =>
    decideMutation.isPending && decideMutation.variables?.item.key === item.key;

  const renderGroups = (
    groups: { sdrId: string | null; name: string; items: ErrorItem[] }[],
    kind: TabKey
  ) => {
    if (groups.length === 0) {
      const msg =
        kind === "pendentes"
          ? "Nenhum erro pendente no período"
          : kind === "confirmados"
            ? "Nenhum erro confirmado no período"
            : "Nenhum lead qualificado corretamente no período";
      return <div className="text-center text-muted-foreground py-10 text-sm">{msg}</div>;
    }

    const badgeClass =
      kind === "pendentes"
        ? "border-amber-500/40 text-amber-600"
        : kind === "confirmados"
          ? "border-rose-500/40 text-rose-600"
          : "border-emerald-500/40 text-emerald-600";

    return (
      <Accordion type="multiple" className="w-full">
        {groups.map((g) => (
          <AccordionItem key={g.sdrId ?? "none"} value={g.sdrId ?? "none"}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full pr-3">
                <span className="font-medium">{g.name}</span>
                <Badge variant="outline" className={badgeClass}>
                  {g.items.length}{" "}
                  {kind === "qualificados"
                    ? g.items.length === 1
                      ? "lead"
                      : "leads"
                    : g.items.length === 1
                      ? "erro"
                      : "erros"}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="divide-y divide-primary/5 border-t border-primary/5">
                {g.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 py-2 px-1"
                  >
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
                          ? format(new Date(item.scheduledDate), "dd/MM/yyyy")
                          : "—"}
                        {item.scheduledTime ? ` às ${item.scheduledTime}` : ""}
                        {kind !== "pendentes" && item.reviewedAt
                          ? ` · Revisado em ${format(new Date(item.reviewedAt), "dd/MM/yyyy")}${item.reviewedBy ? ` por ${nameOf(item.reviewedBy)}` : ""}`
                          : ""}
                      </p>
                    </div>

                    {canReview && (
                      <div className="flex items-center gap-2">
                        {kind === "pendentes" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"
                              onClick={() => decideMutation.mutate({ item, outcome: "dismissed" })}
                              disabled={isBusy(item)}
                            >
                              {isBusy(item) && decideMutation.variables?.outcome === "dismissed" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-4 w-4" />
                              )}
                              <span className="ml-1">SDR acertou</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                              onClick={() => decideMutation.mutate({ item, outcome: "confirmed" })}
                              disabled={isBusy(item)}
                            >
                              {isBusy(item) && decideMutation.variables?.outcome === "confirmed" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              <span className="ml-1">Validar erro</span>
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => decideMutation.mutate({ item, outcome: null })}
                            disabled={isBusy(item)}
                          >
                            {isBusy(item) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Undo2 className="h-4 w-4" />
                            )}
                            <span className="ml-1">Reabrir</span>
                          </Button>
                        )}
                      </div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="text-xl font-bold">Erros de SDR — {periodLabel}</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Pendentes</p>
          <p className="text-3xl font-bold mt-1">{pendentes.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Aguardando triagem</p>
        </div>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Erros confirmados</p>
          <p className="text-3xl font-bold mt-1">{confirmados.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Validados pelo gestor</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Qualificados corretamente</p>
          <p className="text-3xl font-bold mt-1">{qualificados.length}</p>
          <p className="text-xs text-muted-foreground mt-1">SDR acertou</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">SDRs com erros</p>
          <p className="text-3xl font-bold mt-1">
            {new Set(unified.filter((u) => u.sdrId).map((u) => u.sdrId)).size}
          </p>
          <p className="text-xs text-muted-foreground mt-1">SDRs distintos</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="pendentes">
              Pendentes
              <Badge variant="secondary" className="ml-2">{pendentes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="confirmados">
              Erros confirmados
              <Badge variant="secondary" className="ml-2">{confirmados.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="qualificados">
              Qualificados corretamente
              <Badge variant="secondary" className="ml-2">{qualificados.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pendentes" className="mt-3">
            {renderGroups(pendentesGrouped, "pendentes")}
          </TabsContent>
          <TabsContent value="confirmados" className="mt-3">
            {renderGroups(confirmadosGrouped, "confirmados")}
          </TabsContent>
          <TabsContent value="qualificados" className="mt-3">
            {renderGroups(qualificadosGrouped, "qualificados")}
          </TabsContent>
        </Tabs>
      </div>

      <SDRErrorDetailsDrawer
        open={!!detailsAgendamentoId}
        onOpenChange={(o) => !o && setDetailsAgendamentoId(null)}
        agendamentoId={detailsAgendamentoId}
      />
    </div>
  );
}
