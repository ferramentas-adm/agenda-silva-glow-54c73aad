import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { UserPlus, Phone, FileText, MessageSquare, Clock, Sparkles, RotateCcw, History, AlertTriangle } from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
}

interface Closer {
  id: string;
  name: string;
}

export default function AguardandoAtribuicaoPage() {
  const { user } = useAuth();
  const { can, isLoading: permLoading } = usePermissions();
  const queryClient = useQueryClient();
  const [selecting, setSelecting] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data: pending = [], isLoading } = useQuery<Agendamento[]>({
    queryKey: ["pending-closer-assignment", todayStr],
    enabled: can("assign_closer"),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, duration_minutes, briefing, observation, channel_type, sdr_responsavel_id, created_by, meeting_reason, is_5k, original_agendamento_id, sdr_error")
        .is("closer_id", null)
        .is("deleted_at", null)
        .neq("status", "cancelada")
        .neq("meeting_reason", "segunda_reuniao")
        .gte("scheduled_date", todayStr)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  const { data: closers = [] } = useQuery<Closer[]>({
    queryKey: ["closers-active-assignable"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
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
      no_show: "no-show",
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

    // Limite de 2 reuniões por Closer no mesmo horário
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
    if ((count ?? 0) >= 2) {
      toast.error("Esse Closer já tem 2 reuniões nesse horário. Escolha outro.");
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
    } catch (err: any) {
      toast.error(err.message || "Erro ao atribuir Closer.");
    } finally {
      setSavingId(null);
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
            {pending.map((a) => {
              const dateObj = new Date(`${a.scheduled_date}T12:00:00`);
              const sdrLabel = profileName(a.sdr_responsavel_id ?? a.created_by);
              const isReschedule = !!a.original_agendamento_id;
              const original = isReschedule ? originalById(a.original_agendamento_id) : null;
              const hist = leadHistory(a.lead_phone, a.id);
              return (
                <div key={a.id} className="card-meeting p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{a.lead_name}</span>
                        {a.is_5k && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <Sparkles className="h-3 w-3" /> Projeto 5K
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
                            {closers.map((c) => {
                              const blocked = isCloserBlocked(c.id, a.scheduled_date, a.scheduled_time);
                              return (
                                <SelectItem
                                  key={c.id}
                                  value={c.id}
                                  disabled={blocked}
                                  className={blocked ? "opacity-50" : ""}
                                >
                                  {c.name}{blocked ? " · agenda bloqueada" : ""}
                                </SelectItem>
                              );
                            })}
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


                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
