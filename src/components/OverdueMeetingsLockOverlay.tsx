import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, XCircle, Ban, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { formatBRDate } from "@/lib/timezone";
import { useOverdueMeetings, type OverdueMeeting } from "@/hooks/useOverdueMeetings";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
// Somente as telas necessárias para RESOLVER a pendência ficam liberadas.
const HIDE_ON_PREFIXES = ["/cancelar-reuniao", "/venda/", "/lead-detalhes"];

const STATUS_LABEL: Record<string, string> = {
  agendada: "Sem confirmar",
  confirmada: "Confirmada",
  nao_confirmada: "Não confirmada",
  pendente: "Aguardando atribuição",
};

type DirectStatus = "no_show" | "cancelada";


export default function OverdueMeetingsLockOverlay() {
  const { overdue, count, myCloserId, refetch } = useOverdueMeetings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (count === 0) return null;
  if (HIDE_ON_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  const handleDirect = async (m: OverdueMeeting, newStatus: DirectStatus, cancellationReason?: string) => {
    setUpdatingId(m.id);
    try {
      const patch: any = { status: newStatus };
      if (newStatus === "cancelada" && cancellationReason) patch.cancellation_reason = cancellationReason;
      const { data, error } = await supabase
        .from("agendamentos")
        .update(patch)
        .eq("id", m.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar este agendamento.");
      }
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change.
      toast.success(`Status atualizado para ${newStatus === "no_show" ? "No-show" : "Cancelada"}`);
      await queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
      await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  };

  // Transferência (handoff) removida: ninguém sai do bloqueio sem dar desfecho.





  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border-2 border-destructive/40 bg-card shadow-2xl">
          <div className="px-6 py-5 border-b border-destructive/20 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-7 w-7 shrink-0 text-destructive mt-0.5" />
              <div>
                <h2 className="text-xl font-bold text-destructive">
                  Atualize as reuniões vencidas para continuar
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Reuniões passam a exigir atualização <strong>1h05 após o horário agendado</strong>.
                  Defina o desfecho de cada uma abaixo — a tela libera assim que todas estiverem resolvidas.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/lead-detalhes")}
                className="h-8 text-xs gap-1"
              >
                <Eye className="h-3.5 w-3.5" />
                Ver detalhes do cliente
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {overdue.map((m) => {
              const isSdrOfThis = !!user && m.created_by === user.id;
              const isCloserOfThis = !!myCloserId && m.closer_id === myCloserId;
              // canHandoff removido: bypass do bloqueio foi desabilitado para
              // forçar SDR/Closer a atualizarem o status real (No-show / Cancelada / Realizada).
              return (
              <div
                key={m.id}
                className="rounded-lg border border-destructive/20 bg-background p-4"
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{m.lead_name}</span>
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
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatBRDate(m.scheduled_date + "T12:00:00")} às {m.scheduled_time}
                      {m.closer_name && <> · Closer: <strong>{m.closer_name}</strong></>}
                      {m.creator_name && <> · SDR: {m.creator_name}</>}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {isCloserOfThis && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === m.id}
                      onClick={() => navigate(`/venda/${m.id}?lead=${encodeURIComponent(m.lead_name)}`)}
                      className="h-8 text-xs gap-1 text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/30"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Realizada
                    </Button>
                  )}
                  {(isSdrOfThis || isCloserOfThis) && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingId === m.id}
                        onClick={() => handleDirect(m, "no_show")}
                        className="h-8 text-xs gap-1 text-orange-500 hover:bg-orange-500/10 border-orange-500/30"
                      >
                        {updatingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        No-show
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingId === m.id}
                        onClick={() => navigate(`/cancelar-reuniao/${m.id}?lead=${encodeURIComponent(m.lead_name)}`)}
                        className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30"
                      >
                        {updatingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        Cancelada
                      </Button>
                    </>
                  )}
                  {!isSdrOfThis && !isCloserOfThis && (
                    <p className="text-xs text-muted-foreground italic">
                      Aguardando ação do SDR ou Closer responsável.
                    </p>
                  )}
                </div>

              </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-destructive/20 text-xs text-muted-foreground">
            {count} reuni{count === 1 ? "ão" : "ões"} pendente{count === 1 ? "" : "s"}.
          </div>
        </div>
      </div>

    </>
  );
}
