import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
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

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

type Source = "venda" | "agendamento";

interface ErrorItem {
  key: string; // `${source}:${id}`
  source: Source;
  id: string; // row id (venda.id or agendamento.id)
  agendamentoId: string;
  sdrId: string | null;
  leadName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  reviewedAt: string | null;
}

interface VendaRow {
  id: string;
  agendamento_id: string;
  sdr_error: boolean;
  sdr_error_reviewed_at: string | null;
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
}

export default function ErrosSDRTab({ currentDate, dateRange }: Props) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canReview = role === "gestor" || role === "moderador";
  const [tab, setTab] = useState<"novos" | "revisados">("novos");

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
          "id, agendamento_id, sdr_error, sdr_error_reviewed_at, agendamentos!inner(sdr_responsavel_id, created_by, scheduled_date, scheduled_time, lead_name)"
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
          "id, sdr_responsavel_id, created_by, scheduled_date, scheduled_time, lead_name, sdr_error_reviewed_at"
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
      });
    });
    return items;
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

  const nameOf = (id: string | null) =>
    (id && profiles.find((p) => p.user_id === id)?.full_name) || "Sem SDR";

  const reviewMutation = useMutation({
    mutationFn: async (item: ErrorItem) => {
      const payload = {
        sdr_error_reviewed_at: new Date().toISOString(),
        sdr_error_reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      };
      const table = item.source === "venda" ? "vendas" : "agendamentos";
      const { error } = await supabase.from(table).update(payload).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sdr-errors", fromStr, toStr] });
      queryClient.invalidateQueries({ queryKey: ["sdr-errors-agendamentos", fromStr, toStr] });
      toast.success("Erro validado", { description: "Movido para Revisados." });
    },
    onError: (e: unknown) => {
      toast.error("Erro ao validar", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    },
  });

  const novos = useMemo(() => unified.filter((u) => !u.reviewedAt), [unified]);
  const revisados = useMemo(() => unified.filter((u) => !!u.reviewedAt), [unified]);

  const groupBySdr = (items: ErrorItem[]) => {
    const map = new Map<string, { sdrId: string | null; name: string; items: ErrorItem[] }>();
    items.forEach((i) => {
      const k = i.sdrId ?? "__none__";
      if (!map.has(k)) map.set(k, { sdrId: i.sdrId, name: nameOf(i.sdrId), items: [] });
      map.get(k)!.items.push(i);
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  };

  const novosGrouped = useMemo(() => groupBySdr(novos), [novos, profiles]);
  const revisadosGrouped = useMemo(() => groupBySdr(revisados), [revisados, profiles]);

  const periodLabel = `${format(new Date(fromStr), "dd/MM/yyyy")} a ${format(new Date(toStr), "dd/MM/yyyy")}`;

  const renderGroups = (
    groups: { sdrId: string | null; name: string; items: ErrorItem[] }[],
    isReviewedTab: boolean
  ) => {
    if (groups.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-10 text-sm">
          {isReviewedTab
            ? "Nenhum erro revisado no período"
            : "Nenhum erro pendente no período"}
        </div>
      );
    }
    return (
      <Accordion type="multiple" className="w-full">
        {groups.map((g) => (
          <AccordionItem key={g.sdrId ?? "none"} value={g.sdrId ?? "none"}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full pr-3">
                <span className="font-medium">{g.name}</span>
                <Badge
                  variant="outline"
                  className={
                    isReviewedTab
                      ? "border-emerald-500/40 text-emerald-600"
                      : "border-amber-500/40 text-amber-600"
                  }
                >
                  {g.items.length} {g.items.length === 1 ? "erro" : "erros"}
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
                      <p className="text-sm font-medium truncate">{item.leadName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.scheduledDate
                          ? format(new Date(item.scheduledDate), "dd/MM/yyyy")
                          : "—"}
                        {item.scheduledTime ? ` às ${item.scheduledTime}` : ""}
                        {isReviewedTab && item.reviewedAt
                          ? ` · Revisado em ${format(new Date(item.reviewedAt), "dd/MM/yyyy")}`
                          : ""}
                      </p>
                    </div>
                    {!isReviewedTab && canReview && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reviewMutation.mutate(item)}
                        disabled={
                          reviewMutation.isPending &&
                          reviewMutation.variables?.key === item.key
                        }
                      >
                        {reviewMutation.isPending &&
                        reviewMutation.variables?.key === item.key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        <span className="ml-1">Validar</span>
                      </Button>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Novos erros (pendentes)</p>
          <p className="text-3xl font-bold mt-1">{novos.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Aguardando validação</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs text-muted-foreground font-medium">Revisados</p>
          <p className="text-3xl font-bold mt-1">{revisados.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Já validados pelo gestor</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">SDRs com erros</p>
          <p className="text-3xl font-bold mt-1">{sdrIds.length}</p>
          <p className="text-xs text-muted-foreground mt-1">SDRs distintos</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "novos" | "revisados")}>
          <TabsList>
            <TabsTrigger value="novos">
              Novos erros
              <Badge variant="secondary" className="ml-2">
                {novos.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="revisados">
              Revisados
              <Badge variant="secondary" className="ml-2">
                {revisados.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="novos" className="mt-3">
            {renderGroups(novosGrouped, false)}
          </TabsContent>
          <TabsContent value="revisados" className="mt-3">
            {renderGroups(revisadosGrouped, true)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
