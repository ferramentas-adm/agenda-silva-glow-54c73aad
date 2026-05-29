/**
 * Helper para reenviar dados de um agendamento ao DataCrazy via webhook,
 * usando exatamente o mesmo formato JSON que o trigger
 * `notify_status_change_webhook` produz no banco.
 *
 * Casos de uso:
 *  - Alteração de horário no MESMO dia → status "Confirmado"
 *  - Reagendamento para OUTRO dia → status "Reagendado"
 */

import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/retryWithBackoff";

export type AgendamentoWebhookStatus =
  | "Agendado"
  | "Confirmada"
  | "Confirmado"
  | "Reagendada"
  | "Reagendado"
  | "Realizada"
  | "Cancelar"
  | "No-show"
  | "Excluída";

interface SendArgs {
  agendamentoId: string;
  /** Rótulo de status que será enviado no payload. */
  statusDisplay: AgendamentoWebhookStatus;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function buildCalendarLink(
  leadName: string,
  scheduledDate: string,
  scheduledTime: string,
): string {
  // scheduled_date: YYYY-MM-DD ; scheduled_time: HH:mm
  const startDate = scheduledDate.replace(/-/g, "");
  const [h, m] = scheduledTime.split(":");
  const startTime = `${h}${m}00`;
  const endHour = pad2(Number(h) + 1);
  const start = `${startDate}T${startTime}`;
  const end = `${startDate}T${endHour}${m}00`;
  const text = encodeURIComponent(`Grupo Silva & ${leadName}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&ctz=America/Sao_Paulo`;
}

/**
 * Carrega o agendamento + nomes do closer/SDR e dispara o webhook
 * com o mesmo payload do trigger do banco.
 */
export async function resendAgendamentoWebhook({
  agendamentoId,
  statusDisplay,
}: SendArgs): Promise<void> {
  try {
    const { data: ag, error } = await supabase
      .from("agendamentos")
      .select(
        "id, lead_name, lead_phone, scheduled_date, scheduled_time, created_at, briefing, meet_link, closer_id, sdr_responsavel_id, created_by, meeting_reason, channel_type",
      )
      .eq("id", agendamentoId)
      .maybeSingle();

    if (error || !ag) {
      console.warn("[resendAgendamentoWebhook] agendamento não encontrado", error);
      return;
    }

    let closerName: string | null = null;
    if (ag.closer_id) {
      const { data: c } = await supabase
        .from("closers")
        .select("name")
        .eq("id", ag.closer_id)
        .maybeSingle();
      closerName = c?.name ?? null;
    }

    const sdrLookupId = ag.sdr_responsavel_id || ag.created_by;
    let sdrName = "";
    if (sdrLookupId) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", sdrLookupId)
        .maybeSingle();
      sdrName = p?.full_name ?? "";
    }

    const scheduledIso = `${ag.scheduled_date}T${ag.scheduled_time}:00Z`;
    const createdIso = new Date(ag.created_at)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    const payload: Record<string, unknown> = {
      lead_name: ag.lead_name,
      lead_phone: ag.lead_phone,
      status: statusDisplay,
      scheduled_datetime: scheduledIso,
      created_at: createdIso,
      sdr_name: sdrName,
      briefing: ag.briefing ?? "",
      calendar_link: buildCalendarLink(
        ag.lead_name,
        ag.scheduled_date,
        ag.scheduled_time,
      ),
    };

    if (closerName) payload.closer_name = closerName;
    if (ag.meet_link) payload.meet_link = ag.meet_link;

    await retryWithBackoff(
      async () => {
        const { error: invokeErr } = await supabase.functions.invoke("datacrazy-webhook", { body: payload });
        if (invokeErr) {
          const wrapped = new Error(invokeErr.message) as Error & { status?: number };
          wrapped.status = (invokeErr as { status?: number }).status;
          throw wrapped;
        }
      },
      { label: "datacrazy-webhook (resend)" },
    );
  } catch (e) {
    console.warn("[resendAgendamentoWebhook] falha ao enviar webhook", e);
  }
}
