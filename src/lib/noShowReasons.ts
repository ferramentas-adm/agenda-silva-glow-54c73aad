/**
 * Classificação dos motivos de "Não compareceu".
 *
 * O status persistido no banco continua sendo `no_show` (ou `cancelada` em
 * registros antigos); o que define a contagem nos quadros é o motivo escolhido
 * (`cancellation_reason`).
 */

/** Motivos que contam como "Cancelado" nos quadros. */
export const CANCEL_REASONS = [
  "Cancelou por desistência",
  "Cancelou por imprevisto pessoal",
  "Sem closer disponível",
] as const;

/** Motivo "Alterou horário para o mesmo dia" (tratamento especial). */
export const SAME_DAY_RESCHEDULE_REASON = "Alterou horário para o mesmo dia";

/** Motivo que conta como No-show. */
export const NO_SHOW_REASON = "No-show";

export type NaoCompareceuBucket = "cancelada" | "no_show" | "ignorado";

interface AgendaLike {
  id: string;
  status: string;
  lead_phone?: string | null;
  scheduled_date?: string | null;
  cancellation_reason?: string | null;
  created_at?: string | null;
}

const normalizePhone = (phone?: string | null) => (phone || "").replace(/\D/g, "").slice(-11);

const norm = (s?: string | null) => (s || "").trim().toLowerCase();

/** Normaliza para comparação: sem acento, sem caixa, sem espaços extras. */
export const normalizeReasonKey = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * Casa um texto com um motivo da lista oficial.
 * Retorna o motivo oficial (com a grafia da lista) ou null quando é texto livre.
 */
export function matchOfficialReason(
  raw: string | null | undefined,
  officialReasons: readonly string[],
): string | null {
  const key = normalizeReasonKey(raw);
  if (!key) return null;
  return officialReasons.find((r) => normalizeReasonKey(r) === key) ?? null;
}

const CANCEL_SET = new Set(CANCEL_REASONS.map((r) => norm(r)));

/**
 * Retorna em qual quadro a agenda deve ser contabilizada.
 * `pool` = agendas do mesmo período (usado para checar reagendamento no mesmo dia).
 */
export function classifyNaoCompareceu<T extends AgendaLike>(ag: T, pool: T[]): NaoCompareceuBucket {
  const isFinalNegative = ag.status === "no_show" || ag.status === "cancelada";
  if (!isFinalNegative) return "ignorado";

  const reason = norm(ag.cancellation_reason);

  // Registros antigos sem motivo: mantém o comportamento por status.
  if (!reason) return ag.status === "cancelada" ? "cancelada" : "no_show";

  if (CANCEL_SET.has(reason)) return "cancelada";
  if (reason === norm(NO_SHOW_REASON)) return "no_show";

  if (reason === norm(SAME_DAY_RESCHEDULE_REASON)) {
    const phone = normalizePhone(ag.lead_phone);
    const hasNewSameDay =
      !!phone &&
      pool.some(
        (o) =>
          o.id !== ag.id &&
          o.scheduled_date === ag.scheduled_date &&
          normalizePhone(o.lead_phone) === phone &&
          o.status !== "no_show" &&
          o.status !== "cancelada",
      );
    return hasNewSameDay ? "ignorado" : "cancelada";
  }

  // Motivos personalizados (adicionados em Admin) contam como No-show.
  return "no_show";
}

/** Conta quantas agendas do pool caem em cada quadro. */
export function splitNaoCompareceu<T extends AgendaLike>(pool: T[]) {
  const cancelada: T[] = [];
  const noShow: T[] = [];
  pool.forEach((a) => {
    const bucket = classifyNaoCompareceu(a, pool);
    if (bucket === "cancelada") cancelada.push(a);
    else if (bucket === "no_show") noShow.push(a);
  });
  return { cancelada, noShow };
}
