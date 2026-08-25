import { useState, useMemo, useEffect, useRef } from "react";
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
import { countsAsSdr } from "@/lib/sdrOverrides";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createGoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { logAudit } from "@/services/auditLog";
import { collectLeadMetaFields } from "@/lib/metaTracking";
import { buscarMetaLeadId } from "@/services/datacrazy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  detectPriorMeetingConflict,
  conflictMessage,
  softDeletePriorMeeting,
  type PriorMeetingConflict,
} from "@/services/reagendamento";



type Step = "lead" | "closer" | "datetime" | "confirm";

interface AgendamentoData {
  lead: Lead;
  closerId: string | null;
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
import { useSlotLimit } from "@/hooks/useSlotLimit";

export default function AgendarPage() {
  const { user } = useAuth();
  // Gate de profile: garante que `is_sdr_override` esteja carregado antes de montar
  // o formulário. Sem isso, os `useState` iniciais usam um `canPickCloser` calculado
  // sem o override e SDRs (override) acabam vendo a etapa de Closer.
  const { data: gateProfile, isLoading: gateLoading } = useQuery({
    queryKey: ["current-profile-sdr-override", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_sdr_override")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ?? { is_sdr_override: false };
    },
  });
  if (user && (gateLoading || gateProfile === undefined)) {
    return (
      <AppLayout>
        <div className="animate-fade-in max-w-2xl mx-auto p-8 text-sm text-muted-foreground">
          Carregando…
        </div>
      </AppLayout>
    );
  }
  return <AgendarPageInner />;
}

function AgendarPageInner() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { limit: slotLimit } = useSlotLimit();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const rescheduleLeadName = searchParams.get("lead_name");
  const rescheduleLeadPhone = searchParams.get("lead_phone");
  const preCloserId = searchParams.get("closer");
  const preDateStr = searchParams.get("date");
  const preTime = searchParams.get("time");
  

  const isReschedule = !!editId;
  const isAdmin = role === "gestor" || (role === "moderador" || role === "apresentador") || role === "supervisor";

  // Verifica se o usuário atual atua como SDR via override (profiles.is_sdr_override),
  // mesmo que tenha role 'closer'/'moderador'. SDRs por override seguem as MESMAS
  // regras de SDR: não escolhem Closer e respeitam limite de slot.
  const { data: currentProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["current-profile-sdr-override", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_sdr_override")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ?? { is_sdr_override: false };
    },
  });
  // Enquanto não soubermos o override, tratamos como SDR por padrão (fail-safe):
  // impede que role='closer' com override veja a etapa de Closer no primeiro render.
  const profileReady = !!user?.id && !profileLoading && currentProfile !== undefined;
  const isSdrOverride = profileReady ? currentProfile?.is_sdr_override === true : true;
  const isSdrRole = role === "sdr" || (role !== "gestor" && role !== "moderador" && isSdrOverride);
  // SDR (incluindo overrides) nunca pode escolher Closer — sempre cai na fila "Aguardando atribuição".
  // Apenas gestor/moderador e closer (para 2ª reunião própria) seguem escolhendo.
  const canPickCloser = isAdmin || (role === "closer" && !isSdrOverride);
  // Determine initial step based on URL params
  const hasPreselection = !!preCloserId && !!preDateStr && !!preTime;

  const [step, setStep] = useState<Step>(isReschedule ? (canPickCloser ? "closer" : "datetime") : hasPreselection ? "lead" : "lead");
  const [lead, setLead] = useState<Lead | null>(
    isReschedule && rescheduleLeadName
      ? { id: "reschedule", name: decodeURIComponent(rescheduleLeadName), phone: decodeURIComponent(rescheduleLeadPhone || "") }
      : null
  );
  const [closerId, setCloserId] = useState<string | null>(canPickCloser ? (preCloserId || null) : null);
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

  // Fetch SDR users for admin selector (role 'sdr' + "Atua como SDR")
  const { data: sdrUsers = [] } = useQuery({
    queryKey: ["sdr-users-for-admin-scheduling"],
    enabled: isAdmin,
    queryFn: async () => {
      const [rolesRes, profilesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.rpc("get_public_profiles"),
      ]);
      const roleMap = new Map<string, string>(((rolesRes.data ?? []) as any[]).map((r: any) => [r.user_id, r.role]));
      return ((profilesRes.data ?? []) as any[])
        .filter((p) => countsAsSdr({ role: roleMap.get(p.user_id), isOverride: p.is_sdr_override, fullName: p.full_name }))
        .map((p) => ({ user_id: p.user_id, full_name: p.full_name }));
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

  // Pre-fill from edit data — em reagendamentos, herda TODOS os dados do agendamento
  // original (lead, briefing, observação, canal, duração, SDR responsável, flag 5k)
  // para que o SDR não precise redigitar nada.
  useEffect(() => {
    if (!editData) return;
    if (!lead) {
      setLead({ id: "edit", name: editData.lead_name, phone: editData.lead_phone });
    }
    // Herda o canal do agendamento original (inclusive para closer em 2ª reunião)
    if (editData.channel_type && !channelType) {
      setChannelType(editData.channel_type);
    }

    if (editData.briefing && !briefingText) {
      setBriefingText(editData.briefing);
    }
    if (editData.observation && !observation) {
      setObservation(editData.observation);
    }
    if (typeof editData.duration_minutes === "number" && editData.duration_minutes !== 60) {
      setDurationMinutes(editData.duration_minutes);
    }
    if (editData.is_5k && !is5k) {
      setIs5k(true);
    }
    if (editData.sdr_responsavel_id && !selectedSdrId) {
      setSelectedSdrId(editData.sdr_responsavel_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData, role]);

  // Autopreenchimento: ao selecionar um lead (fluxo novo, sem editId),
  // buscar a agenda mais recente do mesmo telefone (normalizado) e
  // preencher automaticamente briefing, observação, canal e flag 5k.
  useEffect(() => {
    if (editId) return;
    if (!lead?.phone) return;
    const normalized = lead.phone.replace(/\D/g, "");
    if (!normalized) return;

    let cancelled = false;
    // Debounce 300ms para evitar dispararmos a query a cada tecla.
    const timer = setTimeout(() => {
      (async () => {
        const { data } = await supabase
          .from("agendamentos")
          .select("briefing, observation, channel_type, is_5k, duration_minutes, lead_name, lead_phone")
          .ilike("lead_phone", `%${normalized.slice(-8)}%`)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10);
        if (cancelled || !data) return;
        // Filtra por telefone normalizado exato
        const prior = data.find((a: any) =>
          (a.lead_phone || "").replace(/\D/g, "") === normalized
        ) || data[0];
        if (!prior) return;
        if (prior.briefing) setBriefingText((cur) => cur || prior.briefing);
        if (prior.observation) setObservation((cur) => cur || prior.observation);
        if (prior.channel_type) setChannelType((cur) => cur || prior.channel_type);
        if (prior.is_5k) setIs5k((cur) => cur || true);
        if (typeof prior.duration_minutes === "number" && prior.duration_minutes !== 60) {
          setDurationMinutes((cur) => (cur === 60 ? prior.duration_minutes : cur));
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.phone, editId]);

  const closerName = useMemo(
    () => closers.find((c) => c.id === closerId)?.name ?? "",
    [closers, closerId]
  );

  const canGoNext: Record<Step, boolean> = {
    lead: !!lead,
    // Closer é opcional para gestor/moderador (podem deixar para a fila de atribuição).
    closer: canPickCloser ? true : !!closerId,
    datetime: !!date && !!time,
    confirm: true,
  };

  const baseSteps: Step[] = canPickCloser
    ? ["lead", "closer", "datetime", "confirm"]
    : ["lead", "datetime", "confirm"];
  const steps: Step[] = isReschedule ? baseSteps.filter((s) => s !== "lead") : baseSteps;
  const stepIndex = steps.indexOf(step);

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1]);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(steps[stepIndex - 1]);
  };

  // Closer com is_sdr_override atua como SDR (não como Closer) ao agendar.
  const isCloser = role === "closer" && !isSdrOverride;
  // Campo "Motivo da reunião" foi removido do fluxo:
  // - Closer: meeting_reason gravado automaticamente como 'segunda_reuniao'.
  // - SDR / Gestor / Moderador: nenhum motivo é coletado/gravado (campo aposentado na UI).
  // Closers continuam preenchendo "Justificar Reagendamento" em meetingReasonCustom,
  // mas isso é salvo no campo `observation` (não em meeting_reason).
  const needsReason = false;
  const isReasonRequired = false;
  const resolvedReason = isCloser ? "segunda_reuniao" : null;

  // Tipo de canal é obrigatório para SDR e Moderador (gestor também segue a mesma regra do select).
  // Em 2ª reunião do closer, o canal é herdado do 1º agendamento.
  const channelTypeRequired = (isSdrRole || (role === "moderador" || role === "apresentador") || role === "gestor" || role === "supervisor");

  // Conflito com reunião anterior em aberto (mesmo telefone) — regra de reagendamento.
  const [conflictPrompt, setConflictPrompt] = useState<PriorMeetingConflict | null>(null);
  const resolvedConflictRef = useRef<PriorMeetingConflict | null>(null);

  const handleSubmit = async () => {
    if (!lead || !date || !time || !user) return;
    // Closer continua precisando justificar (vai para `observation`).
    if (isCloser && !meetingReasonCustom.trim()) {
      toast.error("Informe a justificativa do agendamento.");
      return;
    }
    if (isCloser && !closerId) {
      toast.error("Closer não identificado.");
      return;
    }
    // SDR responsável é opcional para gestor/moderador: se não for selecionado
    // e não for 2ª reunião, o próprio agendador (admin) assume o papel de SDR.

    if (channelTypeRequired && !channelType) {
      toast.error("Selecione o Tipo de Canal.");
      return;
    }
    setSubmitting(true);

    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const sdrName = user.user_metadata?.full_name || user.email || "";

    try {
      // Regra de reagendamento: detecta reunião anterior em aberto do mesmo lead.
      // Closers (2ª reunião) e o fluxo de reagendamento explícito ficam fora.
      let conflict = resolvedConflictRef.current;
      if (!isCloser && !editId && !conflict) {
        const detected = await detectPriorMeetingConflict(lead.phone, dateStr, null);
        if (detected) {
          setConflictPrompt(detected);
          setSubmitting(false);
          return;
        }
      }

      // Validação anti-corrida: reconta capacidade real do slot imediatamente antes do INSERT.
      // Capacidade = closers ativos − closers com bloqueio pessoal cobrindo o horário.
      // SDR é bloqueado apenas se TODOS os closers ativos disponíveis já estiverem ocupados.
      if (isSdrRole) {
        const slotHour = parseInt(time.slice(0, 2), 10);
        const weekday = new Date(`${dateStr}T12:00:00-03:00`).getDay();
        const [agSlotRes, closersRes, blocksRes] = await Promise.all([
          supabase
            .from("agendamentos")
            .select("closer_id")
            .eq("scheduled_date", dateStr)
            .eq("scheduled_time", time)
            .is("deleted_at", null)
            .neq("status", "cancelada"),
          supabase.from("closers").select("id").eq("active", true),
          supabase
            .from("closer_blocks")
            .select("start_time, end_time, closer_id")
            .or(`and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${weekday})`),
        ]);
        if (agSlotRes.error) throw agSlotRes.error;
        if (closersRes.error) throw closersRes.error;
        if (blocksRes.error) throw blocksRes.error;

        const activeCloserIds = new Set<string>((closersRes.data ?? []).map((c: any) => c.id));
        const blockedAtSlot = new Set<string>();
        for (const b of (blocksRes.data ?? []) as any[]) {
          if (!b.closer_id || !activeCloserIds.has(b.closer_id)) continue;
          const sH = parseInt(String(b.start_time ?? "00").slice(0, 2), 10);
          const eH = parseInt(String(b.end_time ?? "00").slice(0, 2), 10);
          if (slotHour >= sH && slotHour < eH) blockedAtSlot.add(b.closer_id);
        }
        const capacity = Math.max(0, activeCloserIds.size - blockedAtSlot.size);

        const closerIdsBooked = new Set<string>();
        let unassigned = 0;
        for (const r of (agSlotRes.data ?? []) as any[]) {
          if (r.closer_id) closerIdsBooked.add(r.closer_id);
          else unassigned += 1;
        }
        const busy = closerIdsBooked.size + unassigned;

        if (capacity === 0 || busy >= capacity) {
          toast.error(`Horário lotado (${busy}/${capacity}). Todos os closers ativos já estão ocupados nesse horário.`);
          setSubmitting(false);
          return;
        }
      }

      // Google Calendar / Meet só é criado quando há Closer definido.
      // Sem Closer (SDR ou admin que deixou em aberto), evento é criado depois,
      // na atribuição em "Aguardando atribuição".
      let meetLink: string | null = null;
      let meetError = false;
      let googleEventId: string | null = null;

      if (closerId) {
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
          googleEventId = googleResult.event_id ?? null;
        } else {
          meetError = true;
          console.warn("Google Calendar event creation failed:", googleResult.error);
        }
      }

      const closerJustification = isCloser ? meetingReasonCustom.trim() : "";
      const finalObservation = isCloser
        ? [closerJustification, observation.trim()].filter(Boolean).join(" — ") || null
        : (observation.trim() || null);

      // Reagendamento para o MESMO dia = apenas troca de horário: atualiza o
      // próprio registro, sem criar duplicata nem marcar "reagendada".
      // Vale também quando o lead já tem reunião em aberto na MESMA data.
      const sameDayTargetId =
        !!editId && !!editData?.scheduled_date && editData.scheduled_date === dateStr
          ? editId
          : conflict?.mode === "same_day_time_change"
            ? conflict.prior.id
            : null;
      const isSameDayReschedule = !!sameDayTargetId;

      // Faltam < 60 min para a reunião antiga → nova nasce vinculada a ela.
      const linkedOriginalId =
        conflict?.mode === "keep_as_reagendada" ? conflict.prior.id : null;

      // Faltam >= 60 min → a reunião antiga é excluída e substituída pela nova.
      if (conflict?.mode === "delete_old") {
        await softDeletePriorMeeting(conflict.prior.id, user.id);
      }


      // Rastreamento Meta (fbp/fbc + dados de contato) capturado no agendamento.
      const metaFields = collectLeadMetaFields(lead);

      // O campo adicional "Lead ID" (GS-XXXX) só existe na API do CRM do
      // DataCrazy — buscamos sob demanda para o lead selecionado.
      const leadIdCrm = (lead as { id?: string } | null)?.id;
      if (!metaFields.meta_lead_id && leadIdCrm) {
        const crmMetaLeadId = await buscarMetaLeadId(leadIdCrm);
        if (crmMetaLeadId) metaFields.meta_lead_id = crmMetaLeadId;
      }


      let insertedData: { id: string } | null = null;

      if (isSameDayReschedule) {
        const { data: updatedData, error: updateError } = await supabase
          .from("agendamentos")
          .update({
            closer_id: closerId,
            scheduled_time: time,
            duration_minutes: durationMinutes,
            observation: finalObservation,
            briefing: briefingText.trim() || null,
            meet_link: meetLink,
            google_event_id: googleEventId,
            meeting_reason: resolvedReason,
            channel_type: channelType || null,
            is_5k: is5k,
            ...metaFields,
          } as any)
          .eq("id", editId!)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedData) {
          throw new Error("Você não tem permissão para alterar este agendamento.");
        }
        insertedData = updatedData;

        await logAudit("reschedule_same_day", "agendamento", editId, {
          lead_name: lead.name,
          closer_name: closerName,
          scheduled_date: dateStr,
          scheduled_time: time,
        });
      } else {
      const { data: insertedRow, error } = await supabase.from("agendamentos").insert({
        lead_name: lead.name,
        lead_phone: lead.phone,
        closer_id: closerId,
        scheduled_date: dateStr,
        scheduled_time: time,
        duration_minutes: durationMinutes,
        observation: finalObservation,
        briefing: briefingText.trim() || null,
        status: "agendada",
        meet_link: meetLink,
        google_event_id: googleEventId,
        created_by: user.id,
        sdr_responsavel_id: isAdmin ? (selectedSdrId || user.id) : null,
        original_agendamento_id: editId || null,
        meeting_reason: resolvedReason,
        channel_type: channelType || null,
        is_5k: is5k,
        ...metaFields,
      } as any).select("id").single();

      if (error) throw error;
      insertedData = insertedRow;

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

      if (editId) {
        // Apenas o rótulo "reschedule_agendamento" é gravado pelo cliente.
        // O INSERT do novo agendamento e o UPDATE do status do original já são
        // capturados automaticamente pelo trigger log_agendamento_change.
        await logAudit(
          "reschedule_agendamento",
          "agendamento",
          insertedData?.id,
          {
            lead_name: lead.name,
            closer_name: closerName,
            scheduled_date: dateStr,
            scheduled_time: time,
            original_agendamento_id: editId,
          }
        );
      }
      }

      // Reagendamento: o trigger do banco já envia "Reagendada" ao DataCrazy
      // automaticamente no INSERT (status = 'reagendada'), então NÃO chamamos
      // o helper aqui para evitar webhook duplicado.

      queryClient.invalidateQueries({ queryKey: ["booked-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
      queryClient.invalidateQueries({ queryKey: ["slot-counts"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
      queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["reunioes-list"] });


      setSuccess({
        lead,
        closerId,
        closerName: closerId ? closerName : "A definir (fila de atribuição)",
        date,
        time,
        observation,
        meetLink,
        meetError,
        agendamentoId: insertedData?.id ?? null,
        meetingReason: resolvedReason,
        meetingReasonCustom: meetingReason === "outros" ? meetingReasonCustom : null,
        channelType: channelType,
      });

      if (meetError) {
        toast.warning("Reunião agendada, mas o link do Meet não foi gerado.");
      } else if (!closerId) {
        toast.success("Reunião agendada! Aguardando atribuição de Closer.");
      } else {
        toast.success(
          isSameDayReschedule
            ? "Horário atualizado!"
            : editId
              ? "Reunião reagendada!"
              : "Reunião agendada!",
        );
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
        .update({ meet_link: result.meet_link, google_event_id: result.event_id ?? null } as any)
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

                {date && (canPickCloser ? closerId : true) && (
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

                {date && canPickCloser && !closerId && (
                  <p className="text-sm text-muted-foreground">
                    Selecione um closer primeiro (etapa anterior).
                  </p>
                )}
              </div>
            </>
          )}

          {step === "confirm" && lead && date && time && (
            <>
              <h2 className="text-lg font-semibold">Confirmar Agendamento</h2>

              <div className="space-y-3">
                <SummaryRow label="Lead" value={`${lead.name} · ${lead.phone}`} />
                {closerId ? (
                  <SummaryRow label="Closer" value={closerName} />
                ) : (
                  <SummaryRow label="Closer" value="A definir (fila de atribuição)" />
                )}
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
                  <label className="text-sm font-medium">
                    SDR responsável <span className="text-muted-foreground">(opcional)</span>
                  </label>
                  <Select value={selectedSdrId ?? ""} onValueChange={(v) => setSelectedSdrId(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o SDR (ou deixe em branco para assumir)" />
                    </SelectTrigger>
                    <SelectContent>
                      {sdrUsers.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Nenhum SDR cadastrado
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
                  {!selectedSdrId && (
                    <p className="text-xs text-muted-foreground">Se nenhum SDR for selecionado, você será registrado como o SDR responsável.</p>
                  )}
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

              {/* Closer: o canal é herdado do 1º agendamento (somente leitura) */}
              {isCloser && channelType ? (
                <SummaryRow label="Tipo de canal" value={channelType} />
              ) : null}


              {(role === "sdr" || (role === "moderador" || role === "apresentador") || role === "gestor" || role === "supervisor") && (
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
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-4 py-3">
                <div className="space-y-0.5">
                  <label htmlFor="is-5k-toggle" className="text-sm font-medium cursor-pointer">
                    Mentoria com Antônio
                  </label>
                  <p className="text-xs text-muted-foreground">Marque para sinalizar esta reunião como Mentoria com Antônio.</p>
                </div>
                <Switch id="is-5k-toggle" checked={is5k} onCheckedChange={setIs5k} />
              </div>
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
