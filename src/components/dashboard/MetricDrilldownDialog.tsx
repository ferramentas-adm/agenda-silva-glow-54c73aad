import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { formatBRDateTime, brDateOf } from "@/lib/timezone";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CalendarDays, Phone, User, Clock, Pencil, Check, X as XIcon, Loader2, Trash2, ShieldCheck, AlertOctagon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";

interface AgendamentoRef {
  id: string;
}

interface MetricDrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  agendamentoIds: string[];
}

interface AgendamentoDetail {
  id: string;
  lead_name: string;
  lead_phone: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  channel_type: string | null;
  meeting_reason: string | null;
  cancellation_reason: string | null;
  closer_id: string | null;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  created_at: string;
  briefing: string | null;
  original_agendamento_id: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
  pendente: "Pendente",
  nao_confirmada: "Não confirmada",
};

const STATUS_COLOR: Record<string, string> = {
  confirmada: "bg-primary/20 text-primary",
  realizada: "bg-emerald-500/20 text-emerald-500",
  cancelada: "bg-destructive/20 text-destructive",
  no_show: "bg-orange-500/20 text-orange-500",
  reagendada: "bg-blue-500/20 text-blue-500",
};

export default function MetricDrilldownDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  agendamentoIds,
}: MetricDrilldownDialogProps) {
  const { data: details = [], isLoading } = useQuery<AgendamentoDetail[]>({
    queryKey: ["metric-drilldown", agendamentoIds.join(",")],
    enabled: open && agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select(
          "id, lead_name, lead_phone, scheduled_date, scheduled_time, status, channel_type, meeting_reason, cancellation_reason, closer_id, created_by, sdr_responsavel_id, created_at, briefing, original_agendamento_id",
        )
        .in("id", agendamentoIds)
        .order("scheduled_time", { ascending: true });
      return (data ?? []) as AgendamentoDetail[];
    },
  });

  const closerIds = Array.from(new Set(details.map((d) => d.closer_id).filter(Boolean) as string[]));
  const sdrIds = Array.from(
    new Set(details.flatMap((d) => [d.sdr_responsavel_id, d.created_by].filter(Boolean) as string[])),
  );

  const { data: closers = [] } = useQuery({
    queryKey: ["drilldown-closers", closerIds.join(",")],
    enabled: open && closerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").in("id", closerIds);
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["drilldown-profiles", sdrIds.join(",")],
    enabled: open && sdrIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_profiles");
      return data ?? [];
    },
  });

  const { data: vendas = [] } = useQuery({
    queryKey: ["drilldown-vendas", agendamentoIds.join(",")],
    enabled: open && agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("agendamento_id, observacoes, resumo_venda, motivo_nao_fechamento, explicacao_nao_fechamento, valor, vendeu, follow_up, closed_at, created_at, produto")
        .in("agendamento_id", agendamentoIds);
      return data ?? [];
    },
  });

  const originalIds = Array.from(
    new Set(details.map((d) => d.original_agendamento_id).filter(Boolean) as string[]),
  );
  const { data: originals = [] } = useQuery({
    queryKey: ["drilldown-originals", originalIds.join(",")],
    enabled: open && originalIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, scheduled_time")
        .in("id", originalIds);
      return data ?? [];
    },
  });

  const leadPhones = Array.from(
    new Set(details.map((d) => d.lead_phone).filter(Boolean) as string[]),
  );
  const { data: segundaReuniaoMap = new Map<string, { scheduled_date: string; scheduled_time: string }>() } = useQuery<
    Map<string, { scheduled_date: string; scheduled_time: string }>
  >({
    queryKey: ["drilldown-segunda-reuniao", leadPhones.join(","), agendamentoIds.join(",")],
    enabled: open && leadPhones.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, lead_phone, scheduled_date, scheduled_time, meeting_reason, created_at")
        .in("lead_phone", leadPhones)
        .eq("meeting_reason", "segunda_reuniao")
        .order("created_at", { ascending: false });
      const m = new Map<string, { scheduled_date: string; scheduled_time: string }>();
      for (const r of (data ?? []) as any[]) {
        for (const d of details) {
          if (d.lead_phone !== r.lead_phone) continue;
          if (new Date(r.created_at) <= new Date(d.created_at)) continue;
          if (!m.has(d.id)) m.set(d.id, { scheduled_date: r.scheduled_date, scheduled_time: r.scheduled_time });
        }
      }
      return m;
    },
  });

  const { data: followUpCloseDateMap = new Map<string, string>() } = useQuery<Map<string, string>>({
    queryKey: ["drilldown-fu-closes", agendamentoIds.join(",")],
    enabled: open && agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("entity_id, details, created_at")
        .eq("entity_type", "venda")
        .eq("action", "follow_up_atualizado")
        .in("entity_id", agendamentoIds)
        .range(0, 9999);
      const m = new Map<string, string>();
      ((data ?? []) as { entity_id: string | null; details: any; created_at: string }[])
        .forEach((r) => {
          if (!r.entity_id) return;
          if ((r.details?.outcome ?? "") !== "fechou") return;
          const cur = m.get(r.entity_id);
          if (!cur || cur < r.created_at) m.set(r.entity_id, brDateOf(r.created_at));
        });
      return m;
    },
  });


  const closerMap = new Map(closers.map((c: any) => [c.id, c.name]));
  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.full_name]));
  const vendaMap = new Map(vendas.map((v: any) => [v.agendamento_id, v]));
  const originalMap = new Map(originals.map((o: any) => [o.id, o]));

  const { role } = useAuth();
  const canEditValor = role === "gestor" || role === "moderador" || role === "apresentador" || role === "supervisor";
  const canDeleteVenda = role === "gestor" || role === "moderador" || role === "apresentador" || role === "supervisor";
  const canEditDate = role === "gestor" || role === "moderador" || role === "apresentador" || role === "supervisor";
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>("");
  const [savingDate, setSavingDate] = useState(false);

  const startEditDate = (agId: string, current: string) => {
    setEditingDateId(agId);
    setEditDateValue(current);
  };
  const cancelEditDate = () => {
    setEditingDateId(null);
    setEditDateValue("");
  };
  const saveEditDate = async (agId: string) => {
    if (!editDateValue || !/^\d{4}-\d{2}-\d{2}$/.test(editDateValue)) {
      toast.error("Data inválida");
      return;
    }
    setSavingDate(true);
    const { error } = await supabase
      .from("vendas")
      .update({ closed_at: editDateValue })
      .eq("agendamento_id", agId);
    setSavingDate(false);
    if (error) {
      toast.error("Erro ao atualizar data: " + error.message);
      return;
    }
    toast.success("Data da venda atualizada");
    cancelEditDate();
    await queryClient.invalidateQueries({ queryKey: ["drilldown-vendas"] });
    await queryClient.invalidateQueries({ queryKey: ["metric-drilldown"] });
    await queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
    await queryClient.invalidateQueries({ queryKey: ["vendas"] });
    await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
  };

  const startEdit = (agId: string, current: number | null) => {
    setEditingId(agId);
    setEditValue(current != null ? String(current).replace(".", ",") : "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };
  const saveEdit = async (agId: string) => {
    const normalized = editValue.replace(/\./g, "").replace(",", ".").trim();
    const num = Number(normalized);
    if (!normalized || Number.isNaN(num) || num < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("vendas")
      .update({ valor: num })
      .eq("agendamento_id", agId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao atualizar valor: " + error.message);
      return;
    }
    toast.success("Valor atualizado");
    cancelEdit();
    await queryClient.invalidateQueries({ queryKey: ["drilldown-vendas"] });
    await queryClient.invalidateQueries({ queryKey: ["vendas"] });
    await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
  };

  const handleDelete = async (agId: string) => {
    setDeleting(true);
    const { error } = await supabase
      .from("vendas")
      .delete()
      .eq("agendamento_id", agId);
    setDeleting(false);
    setDeleteConfirmId(null);
    if (error) {
      toast.error("Erro ao excluir venda: " + error.message);
      return;
    }
    toast.success("Venda excluída");
    await queryClient.invalidateQueries({ queryKey: ["drilldown-vendas"] });
    await queryClient.invalidateQueries({ queryKey: ["vendas"] });
    await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
  };

  // ─── Classificação de erros do Closer (gestor) ────────────────
  const isGestor = role === "gestor";
  const { items: errorCategories } = useAppSettingList(APP_SETTING_KEYS.closer_error_categories, []);
  const { data: closerReviews = [] } = useQuery<
    { id: string; agendamento_id: string; classification: "closer_error" | "acerto"; error_description: string | null; error_category: string | null; reviewed_by: string | null; reviewed_at: string }[]
  >({
    queryKey: ["drilldown-closer-reviews", agendamentoIds.join(",")],
    enabled: open && agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("closer_error_reviews")
        .select("id, agendamento_id, classification, error_description, error_category, reviewed_by, reviewed_at")
        .in("agendamento_id", agendamentoIds);
      return data ?? [];
    },
  });
  const closerReviewMap = new Map(closerReviews.map((r) => [r.agendamento_id, r]));

  const [classifyOpen, setClassifyOpen] = useState(false);
  const [classifyAg, setClassifyAg] = useState<AgendamentoDetail | null>(null);
  const [classifyDesc, setClassifyDesc] = useState("");
  const [classifyCategory, setClassifyCategory] = useState<string>("");
  const [classifyExistingId, setClassifyExistingId] = useState<string | null>(null);
  const [classifyType, setClassifyType] = useState<"closer_error" | "acerto">("closer_error");
  const [savingClassify, setSavingClassify] = useState(false);

  const openClassify = (d: AgendamentoDetail) => {
    setClassifyAg(d);
    setClassifyDesc("");
    setClassifyCategory("");
    setClassifyExistingId(null);
    setClassifyType("closer_error");
    setClassifyOpen(true);
  };

  const openReclassify = (d: AgendamentoDetail) => {
    const review = closerReviewMap.get(d.id);
    setClassifyAg(d);
    setClassifyDesc(review?.error_description ?? "");
    setClassifyCategory(review?.error_category ?? "");
    setClassifyExistingId(review?.id ?? null);
    setClassifyType((review?.classification as "closer_error" | "acerto") ?? "closer_error");
    setClassifyOpen(true);
  };

  const submitClassify = async () => {
    if (!classifyAg) return;
    if (classifyType === "closer_error" && !classifyCategory.trim()) {
      toast.error("Selecione a categoria do erro");
      return;
    }
    setSavingClassify(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const basePayload =
      classifyType === "closer_error"
        ? {
            classification: "closer_error" as const,
            error_category: classifyCategory.trim(),
            error_description: classifyDesc.trim() || null,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          }
        : {
            classification: "acerto" as const,
            error_category: null,
            error_description: null,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          };
    const { error } = classifyExistingId
      ? await (supabase as any)
          .from("closer_error_reviews")
          .update(basePayload)
          .eq("id", classifyExistingId)
      : await (supabase as any).from("closer_error_reviews").insert({
          agendamento_id: classifyAg.id,
          closer_id: classifyAg.closer_id,
          ...basePayload,
        });
    setSavingClassify(false);
    if (error) {
      toast.error("Erro ao registrar: " + error.message);
      return;
    }
    toast.success(
      classifyType === "acerto"
        ? "Marcado como acerto"
        : classifyExistingId
        ? "Erro atualizado"
        : "Erro do Closer registrado"
    );
    setClassifyOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["drilldown-closer-reviews"] });
    await queryClient.invalidateQueries({ queryKey: ["closer-error-reviews"] });
  };

  const markAcerto = async (d: AgendamentoDetail) => {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await (supabase as any).from("closer_error_reviews").insert({
      agendamento_id: d.id,
      closer_id: d.closer_id,
      classification: "acerto",
      error_category: null,
      error_description: null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("Erro ao registrar: " + error.message);
      return;
    }
    toast.success("Marcado como acerto");
    await queryClient.invalidateQueries({ queryKey: ["drilldown-closer-reviews"] });
    await queryClient.invalidateQueries({ queryKey: ["closer-error-reviews"] });
  };



  const removeClassify = async (reviewId: string) => {
    const { error } = await (supabase as any)
      .from("closer_error_reviews")
      .delete()
      .eq("id", reviewId);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    toast.success("Apontamento removido");
    await queryClient.invalidateQueries({ queryKey: ["drilldown-closer-reviews"] });
    await queryClient.invalidateQueries({ queryKey: ["closer-error-reviews"] });
  };


  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : details.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center italic">
            Nenhum agendamento corresponde a este card.
          </p>
        ) : (
          <div className="space-y-2">
            {details.map((d) => {
              const sdrId = d.sdr_responsavel_id || d.created_by;
              const sdrName = sdrId ? profileMap.get(sdrId) || "—" : "—";
              const closerName = d.closer_id ? closerMap.get(d.closer_id) || "—" : "—";
              return (
                <div key={d.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold truncate">{d.lead_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {(() => {
                        const v = vendaMap.get(d.id) as any;
                        if (!v) return null;
                        return v.follow_up ? (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/15">
                            Follow ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sem follow
                          </Badge>
                        );
                      })()}
                      {d.status === "realizada" && (() => {
                        const v = vendaMap.get(d.id) as any;
                        const ofertou = !!v && (v.vendeu === true || Number(v.valor) > 0);
                        return ofertou ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15">
                            Preço ofertado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sem oferta
                          </Badge>
                        );
                      })()}
                      {(() => {
                        const sr = segundaReuniaoMap.get(d.id);
                        if (!sr) return null;
                        const dateLabel = format(new Date(sr.scheduled_date + "T12:00:00"), "dd/MM", { locale: ptBR });
                        return (
                          <Badge
                            className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/15"
                            title={`2ª reunião marcada para ${dateLabel} às ${sr.scheduled_time}`}
                          >
                            2ª reunião {dateLabel}
                          </Badge>
                        );
                      })()}
                      <Badge className={STATUS_COLOR[d.status] || "bg-muted"}>
                        {STATUS_LABEL[d.status] || d.status}
                      </Badge>

                    </div>
                  </div>

                  {/* Classificação de erro do Closer (gestor) */}
                  {d.status === "realizada" && (() => {
                    const v = vendaMap.get(d.id) as any;
                    // Aparece para qualquer reunião realizada que não foi vendida (inclui follow-ups e sem motivo registrado)
                    if (!v || v.vendeu === true) return null;

                    const review = closerReviewMap.get(d.id);
                    if (review && review.classification === "acerto") {
                      return (
                        <div className="rounded-md border p-2 text-xs border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            Não teve erro do Closer
                            <span className="font-normal opacity-80">
                              {" · "}{format(new Date(review.reviewed_at), "dd/MM/yyyy")}
                            </span>
                          </span>
                          {isGestor && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => removeClassify(review.id)}
                              title="Remover apontamento"
                            >
                              <XIcon className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    }
                    if (review) {
                      return (
                        <div className="rounded-md border p-2 text-xs border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold">
                              Erro do Closer
                              {review.error_category ? ` · ${review.error_category}` : ""}
                              {" "}
                              <span className="font-normal opacity-80">
                                · {format(new Date(review.reviewed_at), "dd/MM/yyyy")}
                              </span>
                            </div>
                            {isGestor && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => openReclassify(d)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Ajustar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => removeClassify(review.id)}
                                  title="Remover apontamento"
                                >
                                  <XIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {review.error_description && (
                            <p className="mt-1 whitespace-pre-wrap text-foreground/80">
                              {review.error_description}
                            </p>
                          )}
                        </div>
                      );
                    }
                    if (!isGestor) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
                          onClick={() => openClassify(d)}
                        >
                          <AlertOctagon className="h-3.5 w-3.5 mr-1" />
                          Apontar erro do Closer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"
                          onClick={() => markAcerto(d)}
                        >
                          Não teve erro
                        </Button>
                      </div>
                    );
                  })()}



                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      <span>
                        {format(new Date(d.scheduled_date + "T12:00:00"), "dd/MM", { locale: ptBR })} às{" "}
                        {d.scheduled_time}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      <span className="truncate">{d.lead_phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-foreground/70">Closer:</span>
                      <span className="truncate">{closerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-foreground/70">SDR:</span>
                      <span className="truncate">{sdrName}</span>
                    </div>
                    {(() => {
                      const orig = d.original_agendamento_id
                        ? (originalMap.get(d.original_agendamento_id) as
                            | { scheduled_date: string; scheduled_time: string }
                            | undefined)
                        : undefined;
                      if (orig) {
                        return (
                          <>
                            <div className="flex items-center gap-1.5 col-span-2">
                              <CalendarDays className="h-3 w-3" />
                              <span>
                                Agendado primeira vez em:{" "}
                                {format(new Date(orig.scheduled_date + "T12:00:00"), "dd/MM", { locale: ptBR })}{" "}
                                às {orig.scheduled_time}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-2 text-blue-500">
                              <CalendarDays className="h-3 w-3" />
                              <span>
                                Reagendado para:{" "}
                                {format(new Date(d.scheduled_date + "T12:00:00"), "dd/MM", { locale: ptBR })}{" "}
                                às {d.scheduled_time}
                              </span>
                            </div>
                          </>
                        );
                      }
                      return (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <CalendarDays className="h-3 w-3" />
                          <span>
                            Criado em{" "}
                            {formatBRDateTime(d.created_at).replace(" ", " às ")}
                          </span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const v = vendaMap.get(d.id) as any;
                      if (!v || v.vendeu !== true) return null;
                      const fuClose = followUpCloseDateMap.get(d.id);
                      const effectiveDate: string = v.closed_at
                        ? v.closed_at
                        : (fuClose ?? (v.created_at ? brDateOf(v.created_at) : d.scheduled_date));
                      return (
                        <div className="col-span-2 flex items-center gap-1.5">
                          <CalendarDays className="h-3 w-3 text-emerald-600" />
                          <span className="font-medium text-foreground/80">Data da venda:</span>
                          {editingDateId === d.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="date"
                                autoFocus
                                value={editDateValue}
                                onChange={(e) => setEditDateValue(e.target.value)}
                                className="h-6 w-36 text-xs px-1"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEditDate(d.id);
                                  if (e.key === "Escape") cancelEditDate();
                                }}
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={savingDate} onClick={() => saveEditDate(d.id)}>
                                {savingDate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-emerald-600" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={savingDate} onClick={cancelEditDate}>
                                <XIcon className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span>{format(new Date(effectiveDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
                              {canEditDate && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5"
                                  onClick={() => startEditDate(d.id, effectiveDate)}
                                  title="Corrigir data da venda"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                    {(() => {
                      const vForBadges = vendaMap.get(d.id) as any;
                      const produto = vForBadges?.produto?.trim() || null;
                      if (!d.channel_type && !d.meeting_reason && !produto) return null;
                      return (
                        <div className="col-span-2 flex flex-wrap gap-1.5 pt-1">
                          {produto && (
                            <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15">
                              Produto: {produto}
                            </Badge>
                          )}
                          {d.channel_type && (
                            <Badge variant="secondary" className="text-[10px]">
                              Canal: {d.channel_type}
                            </Badge>
                          )}
                          {d.meeting_reason && (
                            <Badge variant="outline" className="text-[10px]">
                              Motivo: {d.meeting_reason}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                    {d.status === "cancelada" && d.cancellation_reason && (
                      <div className="col-span-2 mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive mb-1">
                          Motivo do cancelamento
                        </p>
                        <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                          {d.cancellation_reason}
                        </p>
                      </div>
                    )}
                    {(() => {
                      const v = vendaMap.get(d.id) as any;
                      const valorNum = typeof v?.valor === "number" ? v.valor : v?.valor ? Number(v.valor) : null;
                      const showValor = v?.vendeu && valorNum != null && !Number.isNaN(valorNum);
                      const resumo = (d as any).briefing?.trim() || v?.resumo_venda?.trim() || null;
                      const explicacao = v?.explicacao_nao_fechamento?.trim() || null;
                      const obs = v?.observacoes?.trim() || null;
                      const obsDistinct = obs && obs !== resumo && obs !== explicacao ? obs : null;
                      return (
                        <>
                          {showValor && (
                            <div className="col-span-2 mt-2 flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                Valor coletado
                              </span>
                              {editingId === d.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="0,00"
                                    className="h-7 w-28 text-sm"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit(d.id);
                                      if (e.key === "Escape") cancelEdit();
                                    }}
                                  />
                                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={() => saveEdit(d.id)}>
                                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={cancelEdit}>
                                    <XIcon className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                    {valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  </span>
                                  {canEditValor && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => startEdit(d.id, valorNum)}
                                      title="Editar valor"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {canDeleteVenda && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-destructive hover:text-destructive"
                                      onClick={() => setDeleteConfirmId(d.id)}
                                      title="Excluir venda"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {resumo && (
                            <div className="col-span-2 mt-2 rounded-md border border-border/60 bg-muted/40 p-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 mb-1">
                                Resumo do cliente
                              </p>
                              <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                                {resumo}
                              </p>
                            </div>
                          )}
                          {explicacao && (
                            <div className="col-span-2 mt-2 rounded-md border border-border/60 bg-muted/40 p-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 mb-1">
                                Explicação do porquê não fechou
                              </p>
                              <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                                {explicacao}
                              </p>
                            </div>
                          )}
                          {obsDistinct && (
                            <div className="col-span-2 mt-2 rounded-md border border-border/60 bg-muted/40 p-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 mb-1">
                                Observações
                              </p>
                              <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                                {obs}
                              </p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. A venda será removida permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={classifyOpen} onOpenChange={setClassifyOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {classifyExistingId ? "Ajustar erro do Closer" : "Apontar erro do Closer"}
          </DialogTitle>
          <DialogDescription>
            Lead: <strong>{classifyAg?.lead_name}</strong>
            {classifyAg?.closer_id && closerMap.get(classifyAg.closer_id)
              ? ` · Closer: ${closerMap.get(classifyAg.closer_id)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {classifyExistingId && (
            <div>
              <label className="text-xs font-medium mb-1 block">Classificação</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={classifyType === "closer_error" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClassifyType("closer_error")}
                >
                  Erro do Closer
                </Button>
                <Button
                  type="button"
                  variant={classifyType === "acerto" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClassifyType("acerto")}
                >
                  Foi acerto
                </Button>
              </div>
            </div>
          )}

          {classifyType === "closer_error" && (
            <>
              <div>
                <label className="text-xs font-medium mb-1 block">Categoria do erro</label>
                <Select value={classifyCategory} onValueChange={setClassifyCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {errorCategories.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Cadastre categorias em Admin → Listas dinâmicas
                      </div>
                    ) : (
                      errorCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Descrição (opcional)</label>
                <Textarea
                  placeholder="Detalhes do erro..."
                  value={classifyDesc}
                  onChange={(e) => setClassifyDesc(e.target.value)}
                  rows={4}
                />
              </div>
            </>
          )}
        </div>


        <DialogFooter>
          <Button variant="ghost" onClick={() => setClassifyOpen(false)} disabled={savingClassify}>
            Cancelar
          </Button>
          <Button onClick={submitClassify} disabled={savingClassify}>
            {savingClassify ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
