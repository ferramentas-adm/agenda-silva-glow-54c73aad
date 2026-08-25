/**
 * Regra de reagendamento (a partir de 25/08/2026):
 *
 * - "Reagendar" serve apenas para remanejo de horário DENTRO DO MESMO DIA.
 * - Para outro dia, cria-se uma NOVA reunião pelo "Agendar" / clique no Calendário.
 *   Nesse caso o sistema resolve a reunião antiga (mesmo telefone, ainda
 *   "agendada"/"confirmada", dentro dos últimos 7 dias):
 *     • faltam MENOS de 60 min (ou já passou) → o usuário escolhe encerrar a
 *       antiga como "No-show" ou "Cancelada" (com motivo) e a nova nasce como
 *       agenda nova, SEM vínculo;
 *     • faltam 60 min OU MAIS → antiga é excluída (exclusão lógica) e a nova é
 *       criada como agenda nova, sem vínculo.
 * - Mesma data com horário diferente → troca de horário no próprio registro.
 */

import { supabase } from "@/integrations/supabase/client";

/** Janela de busca da reunião anterior (em dias). */
export const PRIOR_MEETING_WINDOW_DAYS = 7;
/** Limite (minutos) que separa "remanejo de última hora" de "substituição". */
export const LAST_MINUTE_THRESHOLD = 60;

export interface PriorMeeting {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  lead_name: string;
}

export type ConflictMode =
  /** Mesma data: apenas trocar o horário do próprio registro. */
  | "same_day_time_change"
  /** Faltam < 60 min (ou já passou): antiga é encerrada como no-show/cancelada. */
  | "close_old"
  /** Faltam >= 60 min: antiga é excluída e a nova é agenda nova. */
  | "delete_old";

export interface PriorMeetingConflict {
  prior: PriorMeeting;
  /** Minutos restantes até a reunião antiga (negativo se já passou). */
  minutesUntil: number;
  mode: ConflictMode;
}

function onlyDigits(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

function ymdMinusDays(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Minutos restantes até `date`+`time` no fuso de São Paulo. */
export function minutesUntilMeeting(date: string, time: string): number {
  const hhmm = String(time ?? "00:00").slice(0, 5);
  const target = new Date(`${date}T${hhmm}:00-03:00`).getTime();
  return Math.round((target - Date.now()) / 60000);
}

/**
 * Busca a reunião em aberto (agendada/confirmada) mais recente do mesmo telefone,
 * dentro da janela de 7 dias. Retorna `null` quando não há conflito.
 */
export async function findPriorOpenMeeting(
  leadPhone: string,
  excludeId?: string | null,
): Promise<PriorMeeting | null> {
  const phone = onlyDigits(leadPhone);
  if (!phone) return null;

  const { data, error } = await supabase
    .from("agendamentos")
    .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, status")
    .in("status", ["agendada", "confirmada"])
    .is("deleted_at", null)
    .gte("scheduled_date", ymdMinusDays(PRIOR_MEETING_WINDOW_DAYS))
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[reagendamento] falha ao buscar reunião anterior", error);
    return null;
  }

  const match = (data ?? []).find(
    (r: any) => onlyDigits(r.lead_phone) === phone && r.id !== excludeId,
  ) as any;

  if (!match) return null;
  return {
    id: match.id,
    lead_name: match.lead_name,
    scheduled_date: match.scheduled_date,
    scheduled_time: match.scheduled_time,
    status: match.status,
  };
}

/** Classifica o conflito de acordo com a nova data escolhida. */
export function classifyConflict(
  prior: PriorMeeting,
  newDate: string,
): PriorMeetingConflict {
  const minutes = minutesUntilMeeting(prior.scheduled_date, prior.scheduled_time);
  let mode: ConflictMode;
  if (newDate === prior.scheduled_date) mode = "same_day_time_change";
  else if (minutes < LAST_MINUTE_THRESHOLD) mode = "close_old";
  else mode = "delete_old";
  return { prior, minutesUntil: minutes, mode };
}

/** Detecta e classifica em uma chamada. `null` = pode seguir sem avisos. */
export async function detectPriorMeetingConflict(
  leadPhone: string,
  newDate: string,
  excludeId?: string | null,
): Promise<PriorMeetingConflict | null> {
  const prior = await findPriorOpenMeeting(leadPhone, excludeId);
  if (!prior) return null;
  return classifyConflict(prior, newDate);
}

/** Exclusão lógica da reunião antiga (caso >= 60 min). */
export async function softDeletePriorMeeting(
  priorId: string,
  userId: string | null | undefined,
): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId ?? null,
      deletion_reason: "Reagendado para nova data (substituído por novo agendamento)",
    } as any)
    .eq("id", priorId);
  if (error) throw error;
}

export type PriorOutcome = "no_show" | "cancelada";

/**
 * Encerra a reunião antiga na data original com o desfecho escolhido
 * (No-show ou Cancelada, com motivo).
 */
export async function closePriorMeeting(
  priorId: string,
  outcome: PriorOutcome,
  cancellationReason?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = { status: outcome };
  if (outcome === "cancelada") {
    payload.cancellation_reason =
      cancellationReason?.trim() || "Lead reagendou para outro dia";
  }
  const { error } = await supabase
    .from("agendamentos")
    .update(payload as any)
    .eq("id", priorId);
  if (error) throw error;
}

/** Texto de confirmação exibido ao usuário antes de gravar. */
export function conflictMessage(conflict: PriorMeetingConflict): string {
  const [y, m, d] = conflict.prior.scheduled_date.split("-");
  const when = `${d}/${m}/${y} às ${String(conflict.prior.scheduled_time).slice(0, 5)}`;
  const statusLabel = conflict.prior.status === "confirmada" ? "Confirmada" : "Agendada";

  if (conflict.mode === "same_day_time_change") {
    return `Este lead já tem reunião em ${when} (${statusLabel}). Como é o mesmo dia, o horário dessa reunião será alterado — nenhuma reunião nova será criada.`;
  }
  if (conflict.mode === "close_old") {
    const passou = conflict.minutesUntil < 0;
    const intro = passou
      ? `Este lead tem reunião em ${when} (${statusLabel}) cujo horário já passou.`
      : `Faltam menos de 1h para a reunião de ${when} (${statusLabel}).`;
    return `${intro} Como a nova reunião é para outro dia, informe o desfecho da reunião antiga (No-show ou Cancelada). Ela será encerrada na data original e esta nova será criada como agenda nova.`;
  }
  return `Este lead já tem reunião em ${when} (${statusLabel}). Faltam mais de 1h — a reunião antiga será excluída e substituída por esta nova.`;
}
