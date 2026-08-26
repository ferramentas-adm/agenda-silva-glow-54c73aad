import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Ban,
  Loader2,
  Eye,
  Undo2,
  UserCheck,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { formatBRDate } from "@/lib/timezone";
import { useOverdueMeetings, type OverdueMeeting } from "@/hooks/useOverdueMeetings";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/services/auditLog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import NaoCompareceuDialog from "@/components/NaoCompareceuDialog";
import NovoAgendamentoPromptDialog, { type NovoAgendamentoLead } from "@/components/NovoAgendamentoPromptDialog";

// Somente as telas necessárias para RESOLVER a pendência ficam liberadas.
const HIDE_ON_PREFIXES = ["/venda/", "/lead-detalhes"];

const STATUS_LABEL: Record<string, string> = {
  agendada: "Sem confirmar",
  confirmada: "Confirmada",
  nao_confirmada: "Não confirmada",
};

export default function OverdueMeetingsLockOverlay() {
  const { overdue, count, myCloserId, refetch } = useOverdueMeetings();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [noShowFor, setNoShowFor] = useState<OverdueMeeting | null>(null);
  const [novoAgendamentoLead, setNovoAgendamentoLead] = useState<NovoAgendamentoLead | null>(null);
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState<string>("");
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>("");

  const isAdminLike = role === "gestor" || role === "supervisor" || role === "moderador" || role === "apresentador";

  const { data: moderadorTipo = null } = useQuery({
    queryKey: ["my-moderador-tipo", user?.id],
    enabled: !!user?.id && (role === "moderador" || role === "apresentador"),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("moderador_tipo")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (role === "apresentador") return "sdr" as const;
      return ((data as any)?.moderador_tipo as "sdr" | "closer" | null) ?? null;
    },
  });

  const canTransferToNewCloser =
    role === "gestor" ||
    role === "supervisor" ||
    ((role === "moderador" || role === "apresentador") && moderadorTipo === "sdr");

  if (count === 0) return null;
  if (HIDE_ON_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
    await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    await queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
    await queryClient.invalidateQueries({ queryKey: ["pending-assignments"] });
    refetch();
  };

  const handleDirect = async (m: OverdueMeeting, reason?: string) => {
    setUpdatingId(m.id);
    try {
      const patch: any = { status: "no_show" };
      if (reason) patch.cancellation_reason = reason;
      const { data, error } = await supabase
        .from("agendamentos")
        .update(patch)
        .eq("id", m.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar este agendamento.");
      }
      toast.success("Registrado como não compareceu");
      // Mesmo pós-processamento da tela de detalhes: refetch do dia para não deixar o cartão fantasma.
      await queryClient.refetchQueries({ queryKey: ["agendamentos", m.scheduled_date], exact: true });
      await invalidateAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  };

  // Encaminha a responsabilidade para o Closer (SDR sai da trava, Closer entra).
  const handleForwardToCloser = async (m: OverdueMeeting) => {
    setUpdatingId(m.id);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({
          sdr_handoff_at: new Date().toISOString(),
          closer_returned_at: null,
          closer_return_reason: null,
        } as any)
        .eq("id", m.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para encaminhar este agendamento.");
      toast.success(`Encaminhado para ${m.closer_name ?? "o Closer"}`);
      await invalidateAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao encaminhar");
    } finally {
      setUpdatingId(null);
    }
  };

  // Closer devolve a reunião para o SDR responsável ("não fui eu que atendi").
  const handleReturnToSdr = async (m: OverdueMeeting) => {
    setUpdatingId(m.id);
    try {
      const reason = returnReason.trim();
      const { data, error } = await supabase
        .from("agendamentos")
        .update({
          closer_returned_at: new Date().toISOString(),
          closer_return_reason: reason || null,
          sdr_handoff_at: null,
        } as any)
        .eq("id", m.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para devolver este agendamento.");

      const targetSdr = m.sdr_responsavel_id ?? m.created_by;
      if (targetSdr) {
        await supabase.from("notifications").insert({
          user_id: targetSdr,
          type: "closer_returned_meeting",
          title: "Reunião devolvida pelo Closer",
          message: `${m.closer_name ?? "O Closer"} informou que não atendeu a reunião com ${m.lead_name}.${reason ? ` Obs.: ${reason}` : ""}`,
          entity_type: "agendamento",
          entity_id: m.id,
        } as any);
      }

      await logAudit("closer_return_to_sdr", "agendamento", m.id, {
        lead_name: m.lead_name,
        closer_name: m.closer_name ?? "",
        scheduled_date: m.scheduled_date,
        scheduled_time: m.scheduled_time,
        reason: reason || null,
      });

      toast.success("Reunião devolvida para o SDR responsável");
      setReturnFor(null);
      setReturnReason("");
      await invalidateAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao devolver a reunião");
    } finally {
      setUpdatingId(null);
    }
  };

  // Gestor/supervisor/moderador de SDR define qual closer efetivamente atendeu a reunião.
  // A reunião já aconteceu: nada é criado no Google, apenas a responsabilidade de registro muda.
  const handleTransferToNewCloser = async (m: OverdueMeeting) => {
    if (!transferTarget || transferTarget === m.closer_id) {
      toast.error("Escolha um closer diferente do atual");
      return;
    }
    setUpdatingId(m.id);
    try {
      const { error } = await supabase.rpc("reassign_agendamento_closer_for_result" as any, {
        _agendamento_id: m.id,
        _new_closer_id: transferTarget,
      } as any);
      if (error) throw error;

      toast.success("Closer que atendeu definido — ele já pode registrar a reunião");
      setTransferFor(null);
      setTransferTarget("");
      await invalidateAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao definir o closer que atendeu");
    } finally {
      setUpdatingId(null);
    }
  };


  // Lista de closers ativos para o dialog "Enviar para novo closer".
  const { data: transferableClosers = [] } = useQuery({
    queryKey: ["transferable-closers-trava"],
    enabled: transferFor !== null,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  return (
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
                Reuniões exigem atualização <strong>1h05 após o horário agendado</strong>. O{" "}
                <strong>SDR</strong> resolve marcando <strong>Não compareceu</strong> ou encaminhando
                para o <strong>Closer</strong>. Quando o closer original não pode atender, gestores,
                supervisores e moderadores de SDR podem enviar a reunião para um{" "}
                <strong>novo closer</strong>. O <strong>Closer</strong>, por sua vez, marca{" "}
                <strong>Realizada</strong> ou, se não foi ele quem atendeu, devolve a reunião para o{" "}
                <strong>SDR responsável</strong>. Quando a agenda foi criada pelo próprio closer da
                reunião, todas as opções aparecem juntas.
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
            const busy = updatingId === m.id;
            const canSdr = m.stage === "sdr" || m.stage === "both";
            const canCloser = m.stage === "closer" || m.stage === "both";
            return (
              <div key={m.id} className="rounded-lg border border-destructive/20 bg-background p-4">
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
                      <Badge variant="outline" className="text-[10px] border-muted-foreground/30">
                        {m.stage === "sdr"
                          ? "Etapa: SDR"
                          : m.stage === "closer"
                            ? "Etapa: Closer"
                            : "Etapa: SDR + Closer"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatBRDate(m.scheduled_date + "T12:00:00")} às {m.scheduled_time}
                      {m.closer_name && (
                        <>
                          {" "}
                          · Closer: <strong>{m.closer_name}</strong>
                        </>
                      )}
                      {m.creator_name && <> · SDR: {m.creator_name}</>}
                    </p>
                  </div>
                </div>

                {/* ETAPA 1 — SDR (também aparece no modo combinado) */}
                {canSdr && (
                  <>
                    {m.closer_returned_at && (
                      <div className="mt-3 rounded-md border border-orange-500/30 bg-orange-500/10 p-2.5 text-xs">
                        <span className="font-semibold text-orange-500">
                          Devolvida pelo Closer {m.closer_name ?? ""}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          — não foi ele quem atendeu. Resolva o status ou peça a um gestor/supervisor
                          para enviar o lead para outro closer.
                        </span>
                        {m.closer_return_reason && (
                          <p className="mt-1 text-muted-foreground">Obs.: {m.closer_return_reason}</p>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setNoShowFor(m)}
                        className="h-8 text-xs gap-1 text-orange-500 hover:bg-orange-500/10 border-orange-500/30"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        Não compareceu
                      </Button>
                      {m.closer_id && m.stage === "sdr" && !m.closer_returned_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handleForwardToCloser(m)}
                          className="h-8 text-xs gap-1"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Enviar para o closer
                        </Button>
                      )}
                      {canTransferToNewCloser && m.closer_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setTransferFor(transferFor === m.id ? null : m.id);
                            setTransferTarget("");
                          }}
                          className="h-8 text-xs gap-1"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          Enviar para novo closer
                        </Button>
                      )}
                    </div>

                    {transferFor === m.id && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                          <span className="text-[11px] text-muted-foreground">
                            Novo closer * — o evento será recriado na agenda dele
                          </span>
                          <Select
                            value={transferTarget}
                            onValueChange={setTransferTarget}
                            disabled={busy}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecione o closer" />
                            </SelectTrigger>
                            <SelectContent>
                              {transferableClosers.map((c) => (
                                <SelectItem key={c.id} value={c.id} className="text-xs">
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={busy || !transferTarget || transferTarget === m.closer_id}
                          onClick={() => handleTransferToNewCloser(m)}
                        >
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                          Confirmar transferência
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* ETAPA 2 — Closer (também aparece no modo combinado) */}
                {canCloser && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => navigate(`/venda/${m.id}?lead=${encodeURIComponent(m.lead_name)}`)}
                        className="h-8 text-xs gap-1 text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/30"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Realizada
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setReturnFor(returnFor === m.id ? null : m.id);
                          setReturnReason("");
                        }}
                        className="h-8 text-xs gap-1"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Não fui eu que atendi
                      </Button>
                    </div>

                    {returnFor === m.id && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                          <span className="text-[11px] text-muted-foreground">
                            Observação (opcional) — a reunião volta para o SDR responsável
                          </span>
                          <Input
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="Ex.: estava em outra call, o SDR remanejou o lead"
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => handleReturnToSdr(m)}>
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                          Devolver para o SDR
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-destructive/20 text-xs text-muted-foreground">
          {count} reuni{count === 1 ? "ão" : "ões"} pendente{count === 1 ? "" : "s"}.
        </div>
      </div>

      <NaoCompareceuDialog
        open={!!noShowFor}
        onOpenChange={(o) => { if (!o) setNoShowFor(null); }}
        leadName={noShowFor?.lead_name}
        loading={updatingId === noShowFor?.id}
        onConfirm={async (reason) => {
          const target = noShowFor;
          if (!target) return;
          await handleDirect(target, reason);
          setNoShowFor(null);
          setNovoAgendamentoLead({
            lead_name: target.lead_name,
            lead_phone: (target as any).lead_phone ?? null,
            lead_email: (target as any).lead_email ?? null,
            closer_id: (target as any).closer_id ?? null,
            channel_type: (target as any).channel_type ?? null,
            meeting_reason: (target as any).meeting_reason ?? null,
          });
        }}
      />

      <NovoAgendamentoPromptDialog
        lead={novoAgendamentoLead}
        onOpenChange={(o) => { if (!o) setNovoAgendamentoLead(null); }}
      />
    </div>
  );
}
