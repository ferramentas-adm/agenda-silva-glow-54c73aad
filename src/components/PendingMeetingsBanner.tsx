import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, XCircle, Ban, Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { usePendingMeetings, type PendingWithMeta } from "@/hooks/usePendingMeetings";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditLog";
import { formatBRDate } from "@/lib/timezone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import CancelReasonDialog from "@/components/CancelReasonDialog";

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
};

type ResolveStatus = "realizada" | "no_show" | "cancelada";

const RESOLVE_OPTIONS: { key: ResolveStatus; label: string; icon: typeof CheckCircle2; cls: string }[] = [
  { key: "realizada", label: "Realizada", icon: CheckCircle2, cls: "text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/30" },
  { key: "no_show", label: "No-show", icon: Ban, cls: "text-orange-500 hover:bg-orange-500/10 border-orange-500/30" },
  { key: "cancelada", label: "Cancelada", icon: XCircle, cls: "text-destructive hover:bg-destructive/10 border-destructive/30" },
];

export default function PendingMeetingsBanner() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { count, pendings, byCloser, bySdr, refetch } = usePendingMeetings();
  const [open, setOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PendingWithMeta | null>(null);

  const isManager = role === "gestor" || role === "moderador";
  const canResolveInline = role === "sdr" || role === "closer";

  const bannerText = useMemo(() => {
    if (isManager) {
      return `${count} reuni${count === 1 ? "ão" : "ões"} de dias passados ainda em aberto na empresa`;
    }
    return `Você tem ${count} reuni${count === 1 ? "ão" : "ões"} de dias passados ainda em aberto`;
  }, [count, isManager]);

  const handleResolve = async (m: PendingWithMeta, newStatus: ResolveStatus) => {
    setUpdatingId(m.id);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ status: newStatus } as any)
        .eq("id", m.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar este agendamento.");
      }
      await logAudit("update_status", "agendamento", m.id, {
        lead_name: m.lead_name,
        closer_name: m.closer_name ?? "",
        scheduled_date: m.scheduled_date,
        scheduled_time: m.scheduled_time,
        old_status: m.status,
        new_status: newStatus,
        source: "pending_banner",
      });
      toast.success(`Status atualizado para ${STATUS_LABEL[newStatus] ?? newStatus}`);
      // Invalida caches relacionados
      await queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
      await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  };

  if (count === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-left hover:bg-destructive/15 transition-colors"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-destructive">
            {bannerText}
          </p>
          <p className="text-xs text-muted-foreground">
            Clique para {isManager ? "ver a lista" : "resolver agora"}.
          </p>
        </div>
        <Badge variant="destructive" className="shrink-0 text-base px-3 py-1">
          {count}
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reuniões pendentes de fechamento
            </DialogTitle>
            <DialogDescription>
              Reuniões de dias passados ainda em status <strong>Agendada</strong> ou{" "}
              <strong>Confirmada</strong>. Cada uma deveria ter um desfecho:
              Realizada, No-show ou Cancelada.
            </DialogDescription>
          </DialogHeader>

          {/* Resumo por closer (apenas gestor/moderador) */}
          {isManager && byCloser.length > 0 && (
            <div className="border border-primary/10 rounded-lg p-3 bg-card">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Pendências por Closer
              </p>
              <div className="flex flex-wrap gap-2">
                {byCloser.map((c) => (
                  <Badge
                    key={c.closer_id}
                    variant="outline"
                    className="text-xs border-destructive/30"
                  >
                    {c.name}: <span className="ml-1 font-bold text-destructive">{c.count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Resumo por SDR (apenas gestor/moderador) */}
          {isManager && bySdr.length > 0 && (
            <div className="border border-primary/10 rounded-lg p-3 bg-card">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Pendências por SDR
              </p>
              <div className="flex flex-wrap gap-2">
                {bySdr.map((s) => (
                  <Badge
                    key={s.sdr_id}
                    variant="outline"
                    className="text-xs border-destructive/30"
                  >
                    {s.name}: <span className="ml-1 font-bold text-destructive">{s.count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {pendings.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-primary/10 bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{m.lead_name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        m.status === "confirmada"
                          ? "border-primary/40 text-primary"
                          : "border-blue-400/40 text-blue-400",
                      )}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatBRDate(m.scheduled_date + "T12:00:00")} às {m.scheduled_time}
                    {m.closer_name && <> · Closer: <strong>{m.closer_name}</strong></>}
                    {m.creator_name && <> · SDR: {m.creator_name}</>}
                  </p>
                </div>

                {canResolveInline && (
                  <div className="flex items-center gap-1 shrink-0">
                    {RESOLVE_OPTIONS.map(({ key, label, icon: Icon, cls }) => (
                      <Button
                        key={key}
                        size="sm"
                        variant="outline"
                        disabled={updatingId === m.id}
                        onClick={() => handleResolve(m, key)}
                        className={cn("h-8 text-xs gap-1", cls)}
                      >
                        {updatingId === m.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Icon className="h-3 w-3" />
                        )}
                        {label}
                      </Button>
                    ))}
                  </div>
                )}

                {isManager && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/?date=${m.scheduled_date}`);
                    }}
                  >
                    Ver no calendário
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
