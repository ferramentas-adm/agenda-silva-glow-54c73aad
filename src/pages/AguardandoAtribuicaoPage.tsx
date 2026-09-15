import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { UserPlus, Phone, FileText, MessageSquare, Clock, Sparkles, RotateCcw, History, AlertTriangle, Trash2 } from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useCloserSlotLimit } from "@/hooks/useCloserSlotLimit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createGoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { Navigate } from "react-router-dom";


interface Agendamento {
  id: string;
  lead_name: string;
  lead_phone: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  briefing: string | null;
  observation: string | null;
  channel_type: string | null;
  sdr_responsavel_id: string | null;
  created_by: string;
  meeting_reason: string | null;
  is_5k: boolean | null;
  original_agendamento_id: string | null;
  sdr_error: boolean | null;
  sdr_error_description?: string | null;
}

interface Closer {
  id: string;
  name: string;
  em_treinamento?: boolean | null;
}

export default function AguardandoAtribuicaoPage() {
  const { user } = useAuth();
  const { can, isLoading: permLoading } = usePermissions();
  const { limit: closerSlotLimit } = useCloserSlotLimit();
  const queryClient = useQueryClient();
  const [selecting, setSelecting] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ agendamento: Agendamento; alsoDelete: boolean } | null>(null);
  const [errorDescription, setErrorDescription] = useState("");
  const [submittingError, setSubmittingError] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;




  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data: pending = [], isLoading } = useQuery<Agendamento[]>({
    queryKey: ["pending-closer-assignment", todayStr],
    enabled: can("assign_closer"),
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, duration_minutes, briefing, observation, channel_type, sdr_responsavel_id, created_by, meeting_reason, is_5k, original_agendamento_id, sdr_error, sdr_error_description")
        .is("closer_id", null)
        .is("deleted_at", null)
        // Reuniões já finalizadas (realizada / não compareceu / cancelada) não voltam
        // para atribuição — inclusive quando o closer foi inativado/removido.
        .not("status", "in", "(cancelada,realizada,no_show)")
        .or("meeting_reason.is.null,meeting_reason.neq.segunda_reuniao")
        .gte("scheduled_date", todayStr)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  const totalPages = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
  useEffect(() => {
    if (page >= totalPages) setPage(0);
  }, [totalPages, page]);
  const paged = useMemo(
    () => pending.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [pending, page],
  );

  const { data: closers = [] } = useQuery<Closer[]>({
    queryKey: ["closers-active-assignable"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name, em_treinamento")
        .eq("active", true)
        .not("name", "ilike", "%amanda padilha%")
        .order("name");
      return data ?? [];
    },
  });

  // Bloqueios de agenda dos closers (data específica + recorrentes)
  const pendingDates = Array.from(new Set(pending.map((p) => p.scheduled_date)));
  const pendingWeekdays = Array.from(
    new Set(pendingDates.map((d) => new Date(`${d}T12:00:00`).getDay())),
  );
  const { data: blocks = [] } = useQuery({
    queryKey: ["closer-blocks-pending", pendingDates.join(","), pendingWeekdays.join(",")],
    enabled: pendingDates.length > 0,
    queryFn: async () => {
      const orParts: string[] = [];
      if (pendingDates.length > 0) {
        orParts.push(`and(is_recurring.eq.false,block_date.in.(${pendingDates.join(",")}))`);
      }
      if (pendingWeekdays.length > 0) {
        orParts.push(`and(is_recurring.eq.true,recurrence_weekday.in.(${pendingWeekdays.join(",")}))`);
      }
      const { data } = await supabase
        .from("closer_blocks")
        .select("closer_id, start_time, end_time, is_recurring, recurrence_weekday, block_date")
        .or(orParts.join(","));
      return data ?? [];
    },
  });

  function isCloserBlocked(closerId: string, date: string, time: string): boolean {
    const slotH = parseInt(time.slice(0, 2), 10);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return (blocks as any[]).some((b) => {
      if (b.closer_id !== closerId) return false;
      const matchesDate = b.is_recurring
        ? b.recurrence_weekday === weekday
        : b.block_date === date;
      if (!matchesDate) return false;
      const startH = parseInt(b.start_time.slice(0, 2), 10);
      const endH = parseInt(b.end_time.slice(0, 2), 10);
      return slotH >= startH && slotH < endH;
    });
  }

  // Ocupação dos closers nos horários pedidos pelos SDRs
  const { data: closerLoads = [] } = useQuery({
    queryKey: ["closer-load-pending", pendingDates.join(",")],
    enabled: pendingDates.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("closer_id, scheduled_date, scheduled_time")
        .not("closer_id", "is", null)
        .is("deleted_at", null)
        .neq("status", "cancelada")
        .in("scheduled_date", pendingDates);
      return data ?? [];
    },
  });

  const loadMap = useMemo(() => {
    const m = new Map<string, number>();
    (closerLoads as any[]).forEach((r) => {
      const key = `${r.closer_id}|${r.scheduled_date}|${String(r.scheduled_time).slice(0, 5)}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [closerLoads]);

  const closerLoad = (closerId: string, date: string, time: string) =>
    loadMap.get(`${closerId}|${date}|${time.slice(0, 5)}`) ?? 0;

  // Map de SDR (created_by/sdr_responsavel_id) → nome
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-pending-list"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_profiles");
      return data ?? [];
    },
  });
  const profileName = (id: string | null) =>
    (profiles as any[]).find((p) => p.user_id === id)?.full_name ?? "—";

  // Datas das reuniões originais (para indicador de reagendamento)
  const originalIds = Array.from(
    new Set(pending.map((p) => p.original_agendamento_id).filter(Boolean) as string[]),
  );
  const { data: originals = [] } = useQuery({
    queryKey: ["pending-originals", originalIds.join(",")],
    enabled: originalIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_date, scheduled_time")
        .in("id", originalIds);
      return data ?? [];
    },
  });
  const originalById = (id: string | null) =>
    (originals as any[]).find((o) => o.id === id);

  // Histórico do lead por telefone (reuniões anteriores)
  const rawPhones = Array.from(
    new Set(pending.map((p) => p.lead_phone).filter((p): p is string => !!p)),
  );
  const { data: history = [] } = useQuery({
    queryKey: ["pending-lead-history", rawPhones.join(",")],
    enabled: rawPhones.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, lead_phone, status, scheduled_date, vendas(vendeu)")
        .is("deleted_at", null)
        .in("lead_phone", rawPhones);
      return data ?? [];
    },
  });

  function leadHistory(phone: string, currentId: string) {
    const norm = (phone || "").replace(/\D/g, "");
    if (!norm) return { count: 0, lastLabel: null as string | null };
    const prior = (history as any[])
      .filter(
        (h) =>
          h.id !== currentId &&
          (h.lead_phone || "").replace(/\D/g, "") === norm,
      )
      .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
    if (prior.length === 0) return { count: 0, lastLabel: null };
    const last = prior[0];
    const sold = Array.isArray(last.vendas) && last.vendas.some((v: any) => v.vendeu);
    const statusMap: Record<string, string> = {
      realizada: sold ? "vendida" : "realizada",
      agendada: "agendada",
      confirmada: "confirmada",
      reagendada: "reagendada",
      cancelada: "cancelada",
      no_show: "não compareceu",
    };
    return { count: prior.length, lastLabel: statusMap[last.status] ?? last.status };
  }

  function meetingReasonLabel(reason: string | null, isReschedule: boolean): string {
    if (isReschedule) return "Reagendamento";
    if (!reason || reason === "primeira_reuniao") return "1ª Reunião";
    if (reason === "segunda_reuniao") return "2ª Reunião";
    return reason;
  }

  const handleAssign = async (a: Agendamento) => {
    const closerId = selecting[a.id];
    if (!closerId) {
      toast.error("Selecione um Closer.");
      return;
    }

    if (isCloserBlocked(closerId, a.scheduled_date, a.scheduled_time)) {
      toast.error("Esse Closer está com a agenda bloqueada nesse horário.");
      return;
    }

    // Limite configurável de reuniões por Closer no mesmo horário
    const { count, error: countErr } = await supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("closer_id", closerId)
      .eq("scheduled_date", a.scheduled_date)
      .eq("scheduled_time", a.scheduled_time)
      .is("deleted_at", null)
      .neq("status", "cancelada");
    if (countErr) {
      toast.error("Erro ao validar disponibilidade do Closer.");
      return;
    }
    if ((count ?? 0) >= closerSlotLimit) {
      toast.error(`Esse Closer já tem ${closerSlotLimit} reuniõe${closerSlotLimit > 1 ? "s" : ""} nesse horário. Escolha outro.`);
      return;
    }

    setSavingId(a.id);
    try {
      // Cria evento no Google Calendar do closer escolhido (Meet)
      const sdrName = profileName(a.sdr_responsavel_id ?? a.created_by) || (user?.email ?? "");
      const googleResult = await createGoogleCalendarEvent({
        closer_id: closerId,
        lead_name: a.lead_name,
        lead_phone: a.lead_phone,
        sdr_name: sdrName,
        scheduled_date: a.scheduled_date,
        scheduled_time: a.scheduled_time.slice(0, 5),
        duration_minutes: a.duration_minutes ?? 60,
      });

      const meetLink = googleResult.success ? googleResult.meet_link ?? null : null;
      const googleEventId = googleResult.success ? googleResult.event_id ?? null : null;

      const { error } = await supabase
        .from("agendamentos")
        .update({
          closer_id: closerId,
          meet_link: meetLink,
          google_event_id: googleEventId,
        } as any)
        .eq("id", a.id);
      if (error) throw error;

      toast.success(`Closer atribuído${meetLink ? " e link do Meet gerado" : ""}.`);
      if (!meetLink) {
        toast.warning("Closer atribuído, mas o link do Meet não foi gerado.");
      }

      queryClient.invalidateQueries({ queryKey: ["pending-closer-assignment"] });
      queryClient.invalidateQueries({ queryKey: ["pending-closer-assignment-count"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["reunioes-list"] });
      queryClient.invalidateQueries({ queryKey: ["slot-counts"] });
      queryClient.invalidateQueries({ queryKey: ["closer-load-pending"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atribuir Closer.");
    } finally {
      setSavingId(null);
    }
  };

  const openErrorDialog = (a: Agendamento, alsoDelete: boolean) => {
    setErrorDescription(alsoDelete ? "" : a.sdr_error_description ?? "");
    setErrorDialog({ agendamento: a, alsoDelete });
  };

  const submitErrorDialog = async () => {
    if (!errorDialog) return;
    const desc = errorDescription.trim();
    if (!desc) {
      toast.error("Descreva qual foi o erro do SDR.");
      return;
    }
    const { agendamento: a, alsoDelete } = errorDialog;
    setSubmittingError(true);
    try {
      const nowIso = new Date().toISOString();
      const payload: Record<string, any> = {
        sdr_error: true,
        sdr_error_at: nowIso,
        sdr_error_by: user?.id ?? null,
        sdr_error_description: desc,
      };
      if (alsoDelete) {
        payload.deleted_at = nowIso;
        payload.deletion_reason = `Erro de SDR: ${desc}`;
      }
      const { error } = await supabase
        .from("agendamentos")
        .update(payload as any)
        .eq("id", a.id);
      if (error) throw error;
      toast.success(alsoDelete ? "Erro marcado e reunião excluída." : "Erro de SDR registrado.");
      setErrorDialog(null);
      setErrorDescription("");
      queryClient.invalidateQueries({ queryKey: ["pending-closer-assignment"] });
      queryClient.invalidateQueries({ queryKey: ["pending-closer-assignment-count"] });
      queryClient.invalidateQueries({ queryKey: ["sdr-errors"] });
      queryClient.invalidateQueries({ queryKey: ["sdr-errors-agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar.");
    } finally {
      setSubmittingError(false);
    }
  };

  if (permLoading) {
    return (
      <AppLayout>
        <div className="text-sm text-muted-foreground">Carregando…</div>
      </AppLayout>
    );
  }

  if (!can("assign_closer")) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserPlus className="h-6 w-6" /> Aguardando atribuição
          </h1>
          <p className="text-sm text-muted-foreground">
            Reuniões criadas sem Closer. Atribua um Closer para que o lead receba a confirmação e o link do Meet.
          </p>
        </header>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando reuniões…</div>
        ) : pending.length === 0 ? (
          <div className="card-meeting p-8 text-center text-sm text-muted-foreground">
            Nenhuma reunião aguardando atribuição.
          </div>
        ) : (
          <div className="space-y-3">
            {paged.map((a) => {
              const dateObj = new Date(`${a.scheduled_date}T12:00:00`);
              const sdrLabel = profileName(a.sdr_responsavel_id ?? a.created_by);
              const isReschedule = !!a.original_agendamento_id;
              const original = isReschedule ? originalById(a.original_agendamento_id) : null;
              const hist = leadHistory(a.lead_phone, a.id);
              const closerOptions = closers
                .map((c) => {
                  const blocked = isCloserBlocked(c.id, a.scheduled_date, a.scheduled_time);
                  const load = closerLoad(c.id, a.scheduled_date, a.scheduled_time);
                  return { ...c, blocked, load, full: load >= closerSlotLimit };
                })
                .sort((x, y) => {
                  const rank = (o: typeof x) => (o.blocked ? 2 : o.full ? 1 : 0);
                  if (rank(x) !== rank(y)) return rank(x) - rank(y);
                  if (x.load !== y.load) return x.load - y.load;
                  return x.name.localeCompare(y.name, "pt-BR");
                });
              return (
                <div key={a.id} className="card-meeting p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{a.lead_name}</span>
                        {a.is_5k && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <Sparkles className="h-3 w-3" /> Mentoria com Antônio
                          </span>
                        )}
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {meetingReasonLabel(a.meeting_reason, isReschedule)}
                        </span>
                        {isReschedule && original && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                            title={`Original: ${format(new Date(`${original.scheduled_date}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })} às ${String(original.scheduled_time).slice(0, 5)}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                            de {format(new Date(`${original.scheduled_date}T12:00:00`), "dd/MM", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" /> {a.lead_phone || "—"}
                        </span>
                        <span>
                          {format(dateObj, "EEE, dd/MM/yyyy", { locale: ptBR })} · {a.scheduled_time.slice(0, 5)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {a.duration_minutes ?? 60} min
                        </span>
                        {a.channel_type && (
                          <span className="rounded-full bg-secondary px-2 py-0.5">{a.channel_type}</span>
                        )}
                        <span>SDR: <strong className="text-foreground">{sdrLabel}</strong></span>
                        {hist.count > 0 && (
                          <span className="flex items-center gap-1">
                            <History className="h-3.5 w-3.5" />
                            {hist.count} reunião{hist.count > 1 ? "ões" : ""} anterior{hist.count > 1 ? "es" : ""}
                            {hist.lastLabel ? ` · última: ${hist.lastLabel}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="min-w-[200px]">
                        <Select
                          value={selecting[a.id] ?? ""}
                          onValueChange={(v) => setSelecting((s) => ({ ...s, [a.id]: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar Closer" />
                          </SelectTrigger>
                          <SelectContent>
                            {closerOptions.map((c) => (
                              <SelectItem
                                key={c.id}
                                value={c.id}
                                disabled={c.blocked || c.full}
                                className={c.blocked || c.full ? "opacity-50" : ""}
                              >
                                {c.name}
                                {c.blocked
                                  ? " · agenda bloqueada"
                                  : ` · ${c.load}/${closerSlotLimit}${c.full ? " cheio" : ""}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => handleAssign(a)}
                        disabled={
                          savingId === a.id ||
                          !selecting[a.id] ||
                          (selecting[a.id] ? isCloserBlocked(selecting[a.id], a.scheduled_date, a.scheduled_time) : false)
                        }
                      >
                        {savingId === a.id ? "Atribuindo…" : "Atribuir"}
                      </Button>
                    </div>
                  </div>

                  {(a.briefing || a.observation) && (
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      {a.briefing && (
                        <div className="rounded-md bg-secondary/40 p-2">
                          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                            <FileText className="h-3 w-3" /> Briefing
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-foreground/90">{a.briefing}</p>
                        </div>
                      )}
                      {a.observation && (
                        <div className="rounded-md bg-secondary/40 p-2">
                          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                            <MessageSquare className="h-3 w-3" /> Observação
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-foreground/90">{a.observation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {a.sdr_error && a.sdr_error_description && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                        Erro de SDR registrado
                      </p>
                      <p className="text-xs whitespace-pre-wrap break-words">{a.sdr_error_description}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant={a.sdr_error ? "default" : "outline"}
                      size="sm"
                      onClick={() => openErrorDialog(a, false)}
                      className={a.sdr_error
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "text-amber-600 border-amber-500/40 hover:bg-amber-500/10"}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                      {a.sdr_error ? "Erro de SDR marcado" : "Erro de SDR"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openErrorDialog(a, true)}
                      className="text-rose-600 border-rose-500/40 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Erro SDR + Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <span>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, pending.length)} de {pending.length}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Dialog open={!!errorDialog} onOpenChange={(o) => { if (!o) { setErrorDialog(null); setErrorDescription(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {errorDialog?.alsoDelete ? "Erro de SDR + Excluir reunião" : "Marcar erro de SDR"}
              </DialogTitle>
              <DialogDescription>
                Descreva qual foi o erro do SDR neste lead. A descrição aparecerá no relatório de Erros de SDR.
                {errorDialog?.alsoDelete && " A reunião será excluída e não irá para a agenda."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="sdr-err-desc">Descrição do erro</Label>
              <Textarea
                id="sdr-err-desc"
                value={errorDescription}
                onChange={(e) => setErrorDescription(e.target.value)}
                placeholder="Ex.: SDR não validou faturamento, lead fora do ICP, briefing incompleto…"
                rows={5}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setErrorDialog(null); setErrorDescription(""); }} disabled={submittingError}>
                Cancelar
              </Button>
              <Button
                onClick={submitErrorDialog}
                disabled={submittingError || !errorDescription.trim()}
                className={errorDialog?.alsoDelete ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"}
              >
                {submittingError ? "Salvando…" : errorDialog?.alsoDelete ? "Registrar e excluir" : "Registrar erro"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
