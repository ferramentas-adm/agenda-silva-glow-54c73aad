/**
 * Regras do módulo de Follow-ups.
 *
 * - O lead é da empresa: o closer tem até 2 dias ÚTEIS de tolerância depois da
 *   data combinada para regularizar o follow-up. Enquanto estiver atrasado, a
 *   trava de tela aparece; passando a tolerância, o lead cai no Balde.
 * - Cada closer tem até 10 pontos de contato; cada tentativa exige nova
 *   data/hora combinada e justificativa de no mínimo 100 caracteres.
 * - Sábados e domingos não contam no atraso.
 */

export const MAX_TENTATIVAS = 10;
export const TENTATIVA_JUSTIFICATIVA_MIN = 100;

/** Dias úteis de tolerância antes do lead ir para o Balde de Reativação. */
export const TOLERANCIA_DIAS_UTEIS = 2;

const ymdToUTC = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};

/** true quando a data (YYYY-MM-DD) cai em sábado ou domingo. */
export const isWeekendYMD = (ymd: string) => {
  const dow = new Date(ymdToUTC(ymd)).getUTCDay();
  return dow === 0 || dow === 6;
};

/**
 * Quantos dias ÚTEIS se passaram depois de `dateYmd` até `todayYmd`
 * (a própria data combinada não conta; sábados e domingos são ignorados).
 */
export const diasUteisDeAtraso = (dateYmd: string, todayYmd: string): number => {
  if (!dateYmd || !todayYmd || dateYmd >= todayYmd) return 0;
  let count = 0;
  const end = ymdToUTC(todayYmd);
  const cursor = new Date(ymdToUTC(dateYmd));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};


export type FollowUpStatus = "ativo" | "lixeira" | "balde" | "concluido";
export type FollowUpCanal = "ligacao" | "whatsapp";
export type FollowUpTemperatura = "quente" | "morno" | "frio";

export const CANAL_OPTIONS: { value: FollowUpCanal; label: string }[] = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
];

export const TEMPERATURA_OPTIONS: {
  value: FollowUpTemperatura;
  label: string;
  hint: string;
}[] = [
  { value: "quente", label: "Quente", hint: "Alta chance de fechar" },
  { value: "morno", label: "Morno", hint: "Precisa de mais contato" },
  { value: "frio", label: "Frio", hint: "Baixa chance no momento" },
];

export const TEMPERATURA_RANK: Record<FollowUpTemperatura, number> = {
  quente: 0,
  morno: 1,
  frio: 2,
};

export const temperaturaBadgeClass = (t?: string | null) => {
  switch (t) {
    case "quente":
      return "bg-destructive/15 text-destructive border-destructive/40";
    case "morno":
      return "bg-amber-500/15 text-amber-600 border-amber-500/40 dark:text-amber-400";
    case "frio":
      return "bg-sky-500/15 text-sky-600 border-sky-500/40 dark:text-sky-400";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

export const temperaturaDotClass = (t?: string | null) => {
  switch (t) {
    case "quente":
      return "bg-destructive";
    case "morno":
      return "bg-amber-500";
    case "frio":
      return "bg-sky-500";
    default:
      return "bg-muted-foreground";
  }
};

export const temperaturaLabel = (t?: string | null) =>
  TEMPERATURA_OPTIONS.find((o) => o.value === t)?.label ?? "Sem classificação";

export const canalLabel = (c?: string | null) =>
  CANAL_OPTIONS.find((o) => o.value === c)?.label ?? "Não informado";

/** Minutos de antecedência padrão dos alertas na tela. */
export const DEFAULT_ALERT_OFFSETS = [60, 30, 10];
export const MIN_ALERTS_PER_DAY = 3;

export const parseAlertOffsets = (raw?: string | null): number[] => {
  if (!raw) return DEFAULT_ALERT_OFFSETS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ALERT_OFFSETS;
    const nums = parsed
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1440);
    const uniq = Array.from(new Set(nums)).sort((a, b) => b - a);
    return uniq.length >= MIN_ALERTS_PER_DAY ? uniq : DEFAULT_ALERT_OFFSETS;
  } catch {
    return DEFAULT_ALERT_OFFSETS;
  }
};

/** Monta o link do WhatsApp a partir do telefone do lead. */
export const whatsappLink = (phone?: string | null) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
};
