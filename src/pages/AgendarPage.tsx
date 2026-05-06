import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ArrowRight, ArrowLeft, Link as LinkIcon, FileText } from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/components/AppLayout";
import LeadSearch, { type Lead } from "@/components/agendar/LeadSearch";
import CloserSelector from "@/components/agendar/CloserSelector";
import TimeSlotPicker from "@/components/agendar/TimeSlotPicker";
import SuccessScreen from "@/components/agendar/SuccessScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createGoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { logAudit } from "@/services/auditLog";


type Step = "lead" | "closer" | "datetime" | "confirm";

interface AgendamentoData {
  lead: Lead;
  closerId: string;
  closerName: string;
  date: Date;
  time: string;
  observation: string;
  meetLink: string | null;
  meetError: boolean;
  agendamentoId: string | null;
  meetingReason: string | null;
  meetingReasonCustom: string | null;
  channelType: string | null;
}

const DEFAULT_CHANNEL_TYPES = [
  "CTA", "Formulário Bio", "Indicação", "Reativação", "Renovação", "Social Selling", "Tráfego Pago",
];

import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";

export default function AgendarPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const rescheduleLeadName = searchParams.get("lead_name");
  const rescheduleLeadPhone = searchParams.get("lead_phone");
  const preCloserId = searchParams.get("closer");
  const preDateStr = searchParams.get("date");
  const preTime = searchParams.get("time");
  

  const isReschedule = !!editId;
  // Determine initial step based on URL params
  const hasPreselection = !!preCloserId && !!preDateStr && !!preTime;

  const [step, setStep] = useState<Step>(isReschedule ? "closer" : hasPreselection ? "lead" : "lead");
  const [lead, setLead] = useState<Lead | null>(
    isReschedule && rescheduleLeadName
      ? { id: "reschedule", name: decodeURIComponent(rescheduleLeadName), phone: decodeURIComponent(rescheduleLeadPhone || "") }
      : null
  );
  const [closerId, setCloserId] = useState<string | null>(preCloserId || null);
  const [date, setDate] = useState<Date | undefined>(
    preDateStr ? new Date(preDateStr + "T12:00:00") : undefined
  );
  const [time, setTime] = useState<string | null>(preTime || null);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [observation, setObservation] = useState("");
  const [meetingReason, setMeetingReason] = useState<string | null>(null);
  const [meetingReasonCustom, setMeetingReasonCustom] = useState("");
  const [channelType, setChannelType] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [briefingText, setBriefingText] = useState("");
  const [is5k, setIs5k] = useState(false);
  const { items: channelTypes } = useAppSettingList(APP_SETTING_KEYS.channel_types, DEFAULT_CHANNEL_TYPES);
  const [success, setSuccess] = useState<AgendamentoData | null>(null);
  const [selectedSdrId, setSelectedSdrId] = useState<string | null>(null);

  const isAdmin = role === "gestor" || role === "moderador";

  // Closer: fixar canal como "Segunda Reunião" automaticamente em qualquer fluxo (novo ou reagendamento)
  useEffect(() => {
    if (role === "closer" && channelType !== "Segunda Reunião") {
      setChannelType("Segunda Reunião");
    }
  }, [role, channelType]);

  // Fetch closers for name resolution
  const { data: closers = [] } = useQuery({
    queryKey: ["closers-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch all active users for admin selector (any role)
  const { data: sdrUsers = [] } = useQuery({
    queryKey: ["all-users-for-admin-scheduling"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("active", true)
        .order("full_name", { ascending: true });
      return profiles ?? [];
    },
  });

  // If editing/reagendando, load existing agendamento (também quando lead_name vem na URL,
  // para herdar channel_type / meeting_reason do original)
  const { data: editData } = useQuery({
    queryKey: ["agendamento-edit", editId],
    enabled: !!editId,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("*")
        .eq("id", editId!)
        .single();
      return data;
    },
  });

  // Pre-fill from edit data — lead, channel_type e meeting_reason herdados do agendamento original
  useEffect(() => {
    if (!editData) return;
    if (!lead) {
      setLead({ id: "edit", name: editData.lead_name, phone: editData.lead_phone });
    }
    // Closer: canal sempre fixado como "Segunda Reunião" — não herda do original.
    if (role === "closer") {
      if (!channelType) setChannelType("Segunda Reunião");
    } else if (editData.channel_type && !channelType) {
      setChannelType(editData.channel_type);
    }
    // Campo "Motivo da reunião" foi removido — não herdamos mais meeting_reason
    // do agendamento original em reagendamentos para nenhuma função.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData, role]);

  const closerName = useMemo(
    () => closers.find((c) => c.id === closerId)?.name ?? "",
    [closers, closerId]
  );

  const canGoNext: Record<Step, boolean> = {
    lead: !!lead,
    closer: !!closerId,
    datetime: !!date && !!time,
    confirm: true,
  };

  const steps: Step[] = isReschedule ? ["closer", "datetime", "confirm"] : ["lead", "closer", "datetime", "confirm"];
  const stepIndex = steps.indexOf(step);

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1]);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(steps[stepIndex - 1]);
  };

  const isCloser = role === "closer";
  // Campo "Motivo da reunião" foi removido do fluxo:
  // - Closer: meeting_reason gravado automaticamente como 'segunda_reuniao'.
  // - SDR / Gestor / Moderador: nenhum motivo é coletado/gravado (campo aposentado na UI).
  // Closers continuam preenchendo "Justificar Reagendamento" em meetingReasonCustom,
  // mas isso é salvo no campo `observation` (não em meeting_reason).
  const needsReason = false;
  const isReasonRequired = false;
  const resolvedReason = isCloser ? "segunda_reuniao" : null;

  // Tipo de canal é obrigatório para SDR e Moderador (gestor também segue a mesma regra do select).
  const channelTypeRequired = role === "sdr" || role === "moderador" || role === "gestor";

  const handleSubmit = async () => {
    if (!lead || !closerId || !date || !time || !user) return;
    // Closer continua precisando justificar (vai para `observation`).
    if (isCloser && !meetingReasonCustom.trim()) {
      toast.error("Informe a justificativa do agendamento.");
      return;
    }
    if (channelTypeRequired && !channelType) {
      toast.error("Selecione o Tipo de Canal.");
      return;
    }
    setSubmitting(true);

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const sdrName = user.user_metadata?.full_name || user.email || "";

    try {
      // Reagendamento: o NOVO agendamento entra como 'confirmada' na nova data.
      // O ORIGINAL é marcado como 'reagendada' para que o card no dia antigo
      // apareça como "Reagendada" e seja contabilizado no board.

      // Try to create Google Calendar event + Meet link
      let meetLink: string | null = null;
      let meetError = false;

      const googleResult = await createGoogleCalendarEvent({
        closer_id: closerId,
        lead_name: lead.name,
        lead_phone: lead.phone,
        sdr_name: sdrName,
        scheduled_date: dateStr,
        scheduled_time: time,
        duration_minutes: durationMinutes,
      });

      if (googleResult.success && googleResult.meet_link) {
        meetLink = googleResult.meet_link;
      } else {
        meetError = true;
        console.warn("Google Calendar event creation failed:", googleResult.error);
      }

      // Always create the agendamento, with or without meet link
      // Para closer, anexamos a justificativa em `observation` (já que o campo
      // "Motivo da reunião" foi removido); meeting_reason fica fixo em 'segunda_reuniao'.
      const closerJustification = isCloser ? meetingReasonCustom.trim() : "";
      const finalObservation = isCloser
        ? [closerJustification, observation.trim()].filter(Boolean).join(" — ") || null
        : (observation.trim() || null);

      const { data: insertedData, error } = await supabase.from("agendamentos").insert({
        lead_name: lead.name,
        lead_phone: lead.phone,
        closer_id: closerId,
        scheduled_date: dateStr,
        scheduled_time: time,
        duration_minutes: durationMinutes,
        observation: finalObservation,
        briefing: briefingText.trim() || null,
        // Novo agendamento entra como 'agendada' (trigger envia "Agendado" ao DataCrazy).
        // Reagendamento (mudou de dia) entra como 'reagendada' (trigger envia "Reagendada").
        status: editId ? "reagendada" : "agendada",
        meet_link: meetLink,
        created_by: user.id,
        sdr_responsavel_id: isAdmin && selectedSdrId ? selectedSdrId : null,
        original_agendamento_id: editId || null,
        meeting_reason: resolvedReason,
        // Closer: canal sempre fixado como "Segunda Reunião"
        channel_type: isCloser ? "Segunda Reunião" : (channelType || null),
        is_5k: is5k,
      } as any).select("id").single();

      if (error) throw error;

      // Se for reagendamento, marcar o agendamento ORIGINAL como 'reagendada'
      // para que apareça no calendário do dia antigo com o badge correto.
      if (editId) {
        const { error: updateOriginalError } = await supabase
          .from("agendamentos")
          .update({ status: "reagendada" } as any)
          .eq("id", editId);
        if (updateOriginalError) {
          console.warn("Falha ao atualizar status do agendamento original:", updateOriginalError);
        }
      }

      await logAudit(
        editId ? "reschedule_agendamento" : "create_agendamento",
        "agendamento",
        insertedData?.id,
        {
          lead_name: lead.name,
          closer_name: closerName,
          scheduled_date: dateStr,
          scheduled_time: time,
          ...(editId ? { original_agendamento_id: editId } : {}),
        }
      );

      // Reagendamento: o trigger do banco já envia "Reagendada" ao DataCrazy
      // automaticamente no INSERT (status = 'reagendada'), então NÃO chamamos
      // o helper aqui para evitar webhook duplicado.

      queryClient.invalidateQueries({ queryKey: ["booked-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });


      setSuccess({
        lead,
        closerId,
        closerName,
        date,
        time,
        observation,
        meetLink,
        meetError,
        agendamentoId: insertedData?.id ?? null,
        meetingReason: resolvedReason,
        meetingReasonCustom: meetingReason === "outros" ? meetingReasonCustom : null,
        channelType: isCloser ? "Segunda Reunião" : channelType,
      });

      if (meetError) {
        toast.warning("Reunião agendada, mas o link do Meet não foi gerado.");
      } else {
        toast.success(editId ? "Reunião reagendada!" : "Reunião agendada!");
      }
      // Limpa o briefing logo após o envio para não vazar ao próximo agendamento
      setBriefingText("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao agendar");
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setLead(null);
    setCloserId(null);
    setDate(undefined);
    setTime(null);
    setDurationMinutes(60);
    setObservation("");
    setMeetingReason(null);
    setMeetingReasonCustom("");
    setChannelType(null);
    setSelectedSdrId(null);
    setBriefingText("");
    setIs5k(false);
    setSuccess(null);
    setStep("lead");
  };

  const handleRetryMeet = async () => {
    if (!success || !success.agendamentoId || !success.closerId) return;
    const dateStr = `${success.date.getFullYear()}-${String(success.date.getMonth() + 1).padStart(2, "0")}-${String(success.date.getDate()).padStart(2, "0")}`;
    const sdrName = user?.user_metadata?.full_name || user?.email || "";

    const result = await createGoogleCalendarEvent({
      closer_id: success.closerId,
      lead_name: success.lead.name,
      lead_phone: success.lead.phone,
      sdr_name: sdrName,
      scheduled_date: dateStr,
      scheduled_time: success.time,
      duration_minutes: durationMinutes,
    });

    if (result.success && result.meet_link) {
      await supabase
        .from("agendamentos")
        .update({ meet_link: result.meet_link })
        .eq("id", success.agendamentoId);

      setSuccess({ ...success, meetLink: result.meet_link, meetError: false });
      toast.success("Link do Meet gerado com sucesso!");
    } else {
      toast.error("Falha ao gerar o link do Meet. Tente novamente.");
    }
  };

  if (success) {
    return (
      <AppLayout>
        <SuccessScreen
          leadName={success.lead.name}
          closerName={success.closerName}
          date={format(success.date, "dd/MM/yyyy")}
          time={success.time}
          meetLink={success.meetLink}
          meetError={success.meetError}
          onRetryMeet={handleRetryMeet}
          onReset={resetForm}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
        
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {editId ? "Reagendar Reunião" : "Novo Agendamento"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Etapa {stepIndex + 1} de {steps.length}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= stepIndex ? "bg-primary" : "bg-secondary"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="card-meeting p-5 space-y-4">
          {step === "lead" && (
            <>
              <h2 className="text-lg font-semibold">Buscar Lead</h2>
              <p className="text-sm text-muted-foreground">
                Leads com a tag "agendamento" no DataCrazy.
              </p>
              <LeadSearch
                selectedLead={lead}
                onSelect={setLead}
                onClear={() => setLead(null)}
              />
            </>
          )}

          {step === "closer" && (
            <>
              <h2 className="text-lg font-semibold">Selecionar Closer</h2>
              <p className="text-sm text-muted-foreground">
                Escolha o closer para a reunião.
                {date && ` Disponibilidade para ${format(date, "dd/MM")}.`}
              </p>
              <CloserSelector
                selectedDate={date}
                selectedCloserId={closerId}
                onSelect={setCloserId}
              />
            </>
          )}

          {step === "datetime" && (
            <>
              <h2 className="text-lg font-semibold">Data e Horário</h2>
              <p className="text-sm text-muted-foreground">
                Selecione a data e o horário disponível.
              </p>

              <div className="space-y-4">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setTime(null);
                  }}
                  disabled={(d) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return d < today;
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto rounded-md border")}
                />

                {date && closerId && (
                  <TimeSlotPicker
                    closerId={closerId}
                    date={date}
                    selectedTime={time}
                    onSelect={(t, dur) => {
                      setTime(t);
                      setDurationMinutes(dur ?? 60);
                    }}
                  />
                )}

                {date && !closerId && (
                  <p className="text-sm text-muted-foreground">
                    Selecione um closer primeiro (etapa anterior).
                  </p>
                )}
              </div>
            </>
          )}

          {step === "confirm" && lead && closerId && date && time && (
            <>
              <h2 className="text-lg font-semibold">Confirmar Agendamento</h2>

              <div className="space-y-3">
                <SummaryRow label="Lead" value={`${lead.name} · ${lead.phone}`} />
                <SummaryRow label="Closer" value={closerName} />
                <SummaryRow label="Data" value={format(date, "dd/MM/yyyy")} />
                <SummaryRow
                  label="Horário"
                  value={(() => {
                    const [h, m] = time.split(":").map(Number);
                    const endTotal = h * 60 + m + durationMinutes;
                    const eh = Math.floor(endTotal / 60) % 24;
                    const em = endTotal % 60;
                    const endStr = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                    return `${time} – ${endStr} (${durationMinutes} min)`;
                  })()}
                />
              </div>

              {isAdmin && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Responsável pelo agendamento</label>
                  <Select value={selectedSdrId ?? ""} onValueChange={(v) => setSelectedSdrId(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o responsável (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {sdrUsers.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Nenhum usuário cadastrado
                        </SelectItem>
                      ) : (
                        sdrUsers.map((s) => (
                          <SelectItem key={s.user_id} value={s.user_id}>
                            {s.full_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Caso não selecione, você (administrador) será registrado como responsável.
                  </p>
                </div>
              )}

              {/* Closer: campo "Justificar Reagendamento" aparece em qualquer agendamento (novo ou reagendamento) */}
              {isCloser && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Justificar {isReschedule ? "Reagendamento" : "Agendamento"} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder={`Em poucas palavras, explique o motivo do ${isReschedule ? "reagendamento" : "agendamento"}...`}
                    value={meetingReasonCustom}
                    onChange={(e) => setMeetingReasonCustom(e.target.value.slice(0, 200))}
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground">
                    Campo obrigatório. Máx. 200 caracteres.
                  </p>
                </div>
              )}

              {/* Campo "Motivo da reunião" foi removido do fluxo para todas as funções. */}

              {/* Tipo de canal — closer vê como label fixo "Segunda Reunião"; demais escolhem no select */}
              {isCloser ? (
                <SummaryRow label="Tipo de canal" value="Segunda Reunião" />
              ) : null}

              {(role === "sdr" || role === "moderador" || role === "gestor") && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Tipo de Canal <span className="text-destructive">*</span>
                  </label>
                  <Select value={channelType ?? ""} onValueChange={setChannelType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o canal" />
                    </SelectTrigger>
                    <SelectContent>
                      {channelTypes.map((ct) => (
                        <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!channelType && (
                    <p className="text-xs text-destructive">Campo obrigatório.</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Briefing (opcional)
                </label>
                <Textarea
                  placeholder="Escreva as anotações do briefing aqui..."
                  value={briefingText}
                  onChange={(e) => setBriefingText(e.target.value)}
                  className="resize-none text-sm"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Anotações internas sobre o lead e a reunião.</p>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="space-y-0.5">
                  <label htmlFor="is-5k-toggle" className="text-sm font-medium cursor-pointer">Produto 5K</label>
                  <p className="text-xs text-muted-foreground">Marque se este agendamento é do Produto 5K.</p>
                </div>
                <Switch id="is-5k-toggle" checked={is5k} onCheckedChange={setIs5k} />
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-3">
          {stepIndex > 0 ? (
            <Button variant="secondary" onClick={goBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          ) : (
            <div />
          )}

          {step === "confirm" ? (
            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !canGoNext.confirm ||
                (isCloser && !meetingReasonCustom.trim()) ||
                (channelTypeRequired && !channelType)
              }
              className="gap-2"
            >
              {submitting ? "Agendando..." : editId ? "Reagendar" : "Confirmar Agendamento"}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!canGoNext[step]}
              className="gap-2"
            >
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-secondary/50 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
