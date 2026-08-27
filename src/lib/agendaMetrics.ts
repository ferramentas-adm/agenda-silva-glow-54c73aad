/**
 * Fonte ÚNICA das métricas de agendamentos por dia/período.
 *
 * Usada pelo Calendário (faixa superior de cards) e pelo Dashboard Comercial
 * ("Métricas de Agendamentos"). Qualquer mudança de regra aqui reflete nos dois
 * painéis — é isso que garante que os números batam.
 *
 * Regras canônicas:
 * - `pendente` / `nao_confirmada` (aguardando atribuição) NUNCA contam.
 * - Total do dia = agendas de SDR + 2ª reunião criada por closer.
 * - Usuários inativos contam sempre (histórico não muda ao inativar alguém).
 * - Cancelado x No-show vêm do motivo escolhido em "Não compareceu"
 *   (`splitNaoCompareceu`), não do status bruto.
 */
import { splitNaoCompareceu } from "@/lib/noShowReasons";
import { brPartsOf } from "@/lib/timezone";

/** Status considerados válidos para qualquer total/contagem dos painéis. */
export const AGENDA_TOTAL_STATUSES = [
  "agendada",
  "confirmada",
  "realizada",
  "cancelada",
  "no_show",
  "reagendada",
] as const;

export interface AgendaMetricInput {
  id: string;
  status: string;
  created_by?: string | null;
  sdr_responsavel_id?: string | null;
  meeting_reason?: string | null;
  lead_phone?: string | null;
  scheduled_date?: string | null;
  cancellation_reason?: string | null;
  created_at?: string | null;
}

/** Mapa user_id -> função (já com o override "Atua como SDR" aplicado). */
export type RoleMap = Map<string, string>;

export const isCountableStatus = (status: string) =>
  (AGENDA_TOTAL_STATUSES as readonly string[]).includes(status);

/** SDR: criada por usuário com função SDR (ou override) OU com SDR responsável. */
export const isSdrAgenda = (a: AgendaMetricInput, roleMap: RoleMap): boolean => {
  if (a.created_by && roleMap.get(a.created_by) === "sdr") return true;
  if (a.sdr_responsavel_id) return true;
  return false;
};

/** 2ª reunião: criada por closer OU marcada como `segunda_reuniao`. */
export const isSecondMeetingAgenda = (a: AgendaMetricInput, roleMap: RoleMap): boolean => {
  if (a.created_by && roleMap.get(a.created_by) === "closer") return true;
  if (a.meeting_reason === "segunda_reuniao") return true;
  return false;
};

export interface AgendaMetrics {
  /** Total do dia = SDR + 2ª reunião (sem pendente). */
  totalAgend: number;
  totalSdr: number;
  totalCloser: number;
  closerRealizada: number;
  agendada: number;
  confirmada: number;
  realizada: number;
  /** Ainda a realizar = agendada + confirmada. */
  aindaReal: number;
  cancelada: number;
  noShow: number;
  naoComparecimento: number;
  ids: {
    total: string[];
    sdr: string[];
    closer: string[];
    agendada: string[];
    confirmada: string[];
    realizada: string[];
    cancelada: string[];
    noShow: string[];
  };
}

/**
 * Calcula as métricas canônicas de um pool de agendamentos (já recortado por
 * data/período e pelos filtros da tela).
 */
export function computeAgendaMetrics<T extends AgendaMetricInput>(
  pool: T[],
  roleMap: RoleMap,
): AgendaMetrics {
  // Recorte canônico: status válido E (SDR ou 2ª reunião).
  const scoped = pool.filter(
    (a) =>
      isCountableStatus(a.status) &&
      (isSdrAgenda(a, roleMap) || isSecondMeetingAgenda(a, roleMap)),
  );

  const sdr = scoped.filter((a) => isSdrAgenda(a, roleMap));
  const closer = scoped.filter((a) => !isSdrAgenda(a, roleMap) && isSecondMeetingAgenda(a, roleMap));
  const byStatus = (s: string) => scoped.filter((a) => a.status === s);

  const agendadaList = byStatus("agendada");
  const confirmadaList = byStatus("confirmada");
  const realizadaList = byStatus("realizada");
  const { cancelada, noShow } = splitNaoCompareceu(scoped as any);

  const closerRealizadaList = scoped.filter(
    (a) => a.status === "realizada" && isSecondMeetingAgenda(a, roleMap),
  );

  return {
    totalAgend: scoped.length,
    totalSdr: sdr.length,
    totalCloser: closer.length,
    closerRealizada: closerRealizadaList.length,
    agendada: agendadaList.length,
    confirmada: confirmadaList.length,
    realizada: realizadaList.length,
    aindaReal: agendadaList.length + confirmadaList.length,
    cancelada: cancelada.length,
    noShow: noShow.length,
    naoComparecimento: cancelada.length + noShow.length,
    ids: {
      total: scoped.map((a) => a.id),
      sdr: sdr.map((a) => a.id),
      closer: closer.map((a) => a.id),
      agendada: agendadaList.map((a) => a.id),
      confirmada: confirmadaList.map((a) => a.id),
      realizada: realizadaList.map((a) => a.id),
      cancelada: (cancelada as any[]).map((a) => a.id),
      noShow: (noShow as any[]).map((a) => a.id),
    },
  };
}
