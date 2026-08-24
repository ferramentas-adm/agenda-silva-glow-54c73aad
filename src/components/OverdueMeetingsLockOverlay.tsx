import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
  Loader2,
  Eye,
  CalendarClock,
  Undo2,
  UserCheck,
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

// Somente as telas necessárias para RESOLVER a pendência ficam liberadas.
const HIDE_ON_PREFIXES = ["/cancelar-reuniao", "/venda/", "/lead-detalhes"];

const STATUS_LABEL: Record<string, string> = {
  agendada: "Sem confirmar",
  confirmada: "Confirmada",
  nao_confirmada: "Não confirmada",
};

type DirectStatus = "no_show" | "cancelada";

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 23; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

export default function OverdueMeetingsLockOverlay() {
  const { overdue, count, myCloserId, refetch } = useOverdueMeetings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string>("");
  const [newTime, setNewTime] = useState<string>("");
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState<string>("");


  if (count === 0) return null;
  if (HIDE_ON_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
    await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    await queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
    await queryClient.invalidateQueries({ queryKey: ["pending-assignments"] });
    refetch();
  };

  const handleDirect = async (m: OverdueMeeting, newStatus: DirectStatus) => {
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
      toast.success(`Status atualizado para ${newStatus === "no_show" ? "No-show" : "Cancelada"}`);
      await invalidateAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  };

  // Reagendar (SDR): mesmo dia → troca de horário; outro dia → cria nova agenda
  // (a trigger marca a original como "reagendada"). Em ambos os casos a reunião
  // volta para "Aguardando atribuição", que é responsabilidade do gestor.
  const handleReschedule = async (m: OverdueMeeting) => {
    if (!newDate || !newTime) {
      toast.error("Escolha data e horário");
      return;
    }
    setUpdatingId(m.id);
    try {
      if (newDate === m.scheduled_date) {
        const { data, error } = await supabase
          .from("agendamentos")
          .update({
            scheduled_time: newTime,
            closer_id: null,
            status: "agendada",
            meet_link: null,
            google_event_id: null,
          } as any)
          .eq("id", m.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Sem permissão para alterar este agendamento.");
      } else {
        const { data: orig, error: origErr } = await supabase
          .from("agendamentos")
          .select(
            "lead_name, lead_phone, briefing, meeting_reason, channel_type, duration_minutes, sdr_responsavel_id, created_by",
          )
          .eq("id", m.id)
          .maybeSingle();
        if (origErr) throw origErr;
        const { error } = await supabase.from("agendamentos").insert({
          lead_name: orig?.lead_name ?? m.lead_name,
          lead_phone: orig?.lead_phone ?? m.lead_phone,
          scheduled_date: newDate,
          scheduled_time: newTime,
          status: "agendada",
          closer_id: null,
          original_agendamento_id: m.id,
          briefing: orig?.briefing ?? null,
          meeting_reason: orig?.meeting_reason ?? null,
          channel_type: orig?.channel_type ?? null,
          duration_minutes: orig?.duration_minutes ?? 60,
          sdr_responsavel_id: (orig as any)?.sdr_responsavel_id ?? orig?.created_by ?? user?.id,
          created_by: user?.id,
        } as any);
        if (error) throw error;
      }
      toast.success("Reagendado. Reunião enviada para Aguardando atribuição.");
      setRescheduleFor(null);
      setNewDate("");
      setNewTime("");
      await invalidateAll();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao reagendar");
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
        .update({ sdr_handoff_at: new Date().toISOString() } as any)
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
                Reuniões exigem atualização <strong>1h05 após o horário agendado</strong>. Primeiro o{" "}
                <strong>SDR</strong> resolve (Cancelar, No-show ou Reagendar). Se nenhuma opção for
                factível, ele encaminha para o <strong>Closer</strong>, que marca{" "}
                <strong>Realizada</strong> ou, se não foi ele quem atendeu, devolve a reunião para o{" "}
                <strong>SDR responsável</strong> resolver ou remanejar na agenda. Quando a agenda foi
                criada pelo próprio closer da reunião, todas as opções aparecem juntas.
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
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          navigate(`/cancelar-reuniao/${m.id}?lead=${encodeURIComponent(m.lead_name)}`)
                        }
                        className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => handleDirect(m, "no_show")}
                        className="h-8 text-xs gap-1 text-orange-500 hover:bg-orange-500/10 border-orange-500/30"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        No-show
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRescheduleFor(rescheduleFor === m.id ? null : m.id);
                          setNewDate(m.scheduled_date);
                          setNewTime(m.scheduled_time);
                        }}
                        className="h-8 text-xs gap-1 text-blue-400 hover:bg-blue-500/10 border-blue-400/30"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Reagendar
                      </Button>
                      {m.closer_id && m.stage === "sdr" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handleForwardToCloser(m)}
                          className="h-8 text-xs gap-1"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Encaminhar para o Closer
                        </Button>
                      )}
                    </div>

                    {rescheduleFor === m.id && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">Nova data</span>
                          <Input
                            type="date"
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                            className="h-8 text-xs w-[150px]"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">Novo horário</span>
                          <Select value={newTime} onValueChange={setNewTime}>
                            <SelectTrigger className="h-8 text-xs w-[110px]">
                              <SelectValue placeholder="Horário" />
                            </SelectTrigger>
                            <SelectContent>
                              {TIME_OPTIONS.map((t) => (
                                <SelectItem key={t} value={t} className="text-xs">
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => handleReschedule(m)}>
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                          Confirmar reagendamento
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
                          setTransferFor(transferFor === m.id ? null : m.id);
                          setTransferTo("");
                        }}
                        className="h-8 text-xs gap-1"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Transferir para outro closer
                      </Button>
                    </div>

                    {transferFor === m.id && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">Closer de destino</span>
                          <Select value={transferTo} onValueChange={setTransferTo}>
                            <SelectTrigger className="h-8 text-xs w-[220px]">
                              <SelectValue placeholder="Selecione o closer" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeClosers
                                .filter((c) => c.id !== m.closer_id)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => handleTransfer(m)}>
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                          Confirmar transferência
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
    </div>
  );
}
