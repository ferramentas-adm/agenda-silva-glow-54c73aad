import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/components/AppLayout";
import LeadSearch, { type Lead } from "@/components/agendar/LeadSearch";
import CloserSelector from "@/components/agendar/CloserSelector";
import TimeSlotPicker from "@/components/agendar/TimeSlotPicker";
import SuccessScreen from "@/components/agendar/SuccessScreen";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createGoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { reuniaoAgendada } from "@/services/datacrazy";
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
}

export default function AgendarPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const { pendingCount, syncing, syncNow, refreshCount } = useDataCrazySync();

  const [step, setStep] = useState<Step>("lead");
  const [lead, setLead] = useState<Lead | null>(null);
  const [closerId, setCloserId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string | null>(null);
  const [observation, setObservation] = useState("");
  const [meetingReason, setMeetingReason] = useState<string | null>(null);
  const [meetingReasonCustom, setMeetingReasonCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<AgendamentoData | null>(null);

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

  // If editing, load existing agendamento
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

  // Pre-fill from edit data
  useState(() => {
    if (editData) {
      setLead({ id: "edit", name: editData.lead_name, phone: editData.lead_phone });
      setCloserId(editData.closer_id);
      setDate(new Date(editData.scheduled_date + "T12:00:00"));
      setTime(editData.scheduled_time);
      setObservation(editData.observation ?? "");
    }
  });

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

  const steps: Step[] = ["lead", "closer", "datetime", "confirm"];
  const stepIndex = steps.indexOf(step);

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1]);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(steps[stepIndex - 1]);
  };

  const isReasonRequired = role === "closer";
  const needsReason = role === "closer" || role === "gestor" || role === "moderador";
  const resolvedReason = meetingReason === "outros" ? (meetingReasonCustom.trim() || null) : meetingReason;

  const handleSubmit = async () => {
    if (!lead || !closerId || !date || !time || !user || !observation.trim()) return;
    if (isReasonRequired && !resolvedReason) return;
    setSubmitting(true);

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const sdrName = user.user_metadata?.full_name || user.email || "";

    try {
      // Note: old agendamento keeps its current status (cancelada/no_show)
      // The NEW agendamento will get "reagendada" status if it comes from an edit

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
      });

      if (googleResult.success && googleResult.meet_link) {
        meetLink = googleResult.meet_link;
      } else {
        meetError = true;
        console.warn("Google Calendar event creation failed:", googleResult.error);
      }

      // Always create the agendamento, with or without meet link
      const { data: insertedData, error } = await supabase.from("agendamentos").insert({
        lead_name: lead.name,
        lead_phone: lead.phone,
        closer_id: closerId,
        scheduled_date: dateStr,
        scheduled_time: time,
        observation: observation || null,
        status: editId ? "reagendada" : "confirmada",
        meet_link: meetLink,
        created_by: user.id,
        original_agendamento_id: editId || null,
        meeting_reason: resolvedReason || null,
      } as any).select("id").single();

      if (error) throw error;

      await logAudit("create_agendamento", "agendamento", insertedData?.id, {
        lead_name: lead.name,
        closer_name: closerName,
        date: dateStr,
        time,
      });

      queryClient.invalidateQueries({ queryKey: ["booked-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });

      // DataCrazy integration — full event
      const dateTimeISO = new Date(`${dateStr}T${time}:00`).toISOString();
      reuniaoAgendada({
        leadNome: lead.name,
        leadTelefone: lead.phone,
        closerNome: closerName,
        closerId,
        sdrNome: sdrName,
        sdrId: user.id,
        dataHoraISO: dateTimeISO,
        meetUrl: meetLink || "",
        observacao: observation || "",
        meetingReason: resolvedReason || null,
      }).catch(console.error).finally(refreshCount);

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
      });

      if (meetError) {
        toast.warning("Reunião agendada, mas o link do Meet não foi gerado.");
      } else {
        toast.success(editId ? "Reunião reagendada!" : "Reunião agendada!");
      }
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
    setObservation("");
    setMeetingReason(null);
    setMeetingReasonCustom("");
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
        <DataCrazySyncIndicator pendingCount={pendingCount} syncing={syncing} onSyncNow={syncNow} />
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
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
                        return d < today || d.getDay() === 0 || d.getDay() === 6;
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                {date && closerId && (
                  <TimeSlotPicker
                    closerId={closerId}
                    date={date}
                    selectedTime={time}
                    onSelect={setTime}
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
                <SummaryRow label="Horário" value={time} />
              </div>

              {needsReason && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Motivo da reunião{isReasonRequired ? " (obrigatório)" : ""}
                  </label>
                  <Select value={meetingReason ?? ""} onValueChange={(v) => { setMeetingReason(v); if (v !== "outros") setMeetingReasonCustom(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="segunda_reuniao">Segunda Reunião</SelectItem>
                      <SelectItem value="fechamento">Fechamento</SelectItem>
                      <SelectItem value="remarcado">Remarcado</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  {meetingReason === "outros" && (
                    <Textarea
                      placeholder="Descreva o motivo da reunião..."
                      value={meetingReasonCustom}
                      onChange={(e) => setMeetingReasonCustom(e.target.value.slice(0, 200))}
                      className="resize-none mt-2"
                      rows={2}
                    />
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Observação interna (obrigatório)</label>
                <Textarea
                  placeholder="Notas sobre o lead, contexto da reunião..."
                  value={observation}
                  onChange={(e) => setObservation(e.target.value.slice(0, 1000))}
                  className="resize-none"
                  rows={3}
                  required
                />
                <p className="text-xs text-muted-foreground text-right">{observation.length}/1000</p>
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
              disabled={submitting || !canGoNext.confirm || !observation.trim() || (isReasonRequired && !resolvedReason)}
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
