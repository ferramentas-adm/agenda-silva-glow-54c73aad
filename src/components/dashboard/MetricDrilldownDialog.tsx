import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { formatBRDateTime } from "@/lib/timezone";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarDays, Phone, User, Clock, Pencil, Check, X as XIcon, Loader2, Trash2 } from "lucide-react";

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
        .select("agendamento_id, observacoes, resumo_venda, motivo_nao_fechamento, explicacao_nao_fechamento, valor, vendeu, follow_up")
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

  const closerMap = new Map(closers.map((c: any) => [c.id, c.name]));
  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.full_name]));
  const vendaMap = new Map(vendas.map((v: any) => [v.agendamento_id, v]));
  const originalMap = new Map(originals.map((o: any) => [o.id, o]));

  const { role } = useAuth();
  const canEditValor = role === "gestor" || role === "moderador";
  const canDeleteVenda = role === "gestor" || role === "moderador";
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
                    <div className="flex items-center gap-1.5 shrink-0">
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
                      <Badge className={STATUS_COLOR[d.status] || "bg-muted"}>
                        {STATUS_LABEL[d.status] || d.status}
                      </Badge>
                    </div>
                  </div>

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
                    <div className="flex items-center gap-1.5 col-span-2">
                      <CalendarDays className="h-3 w-3" />
                      <span>
                        Agendado em{" "}
                        {formatBRDateTime(d.created_at).replace(" ", " às ")}
                      </span>
                    </div>
                    {(d.channel_type || d.meeting_reason) && (
                      <div className="col-span-2 flex flex-wrap gap-1.5 pt-1">
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
                    )}
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
    </>
  );
}
