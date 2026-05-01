/**
 * Timezone helpers — toda a aplicação opera no fuso de São Paulo (BRT).
 *
 * Use estas funções sempre que precisar:
 *  - converter um ISO/Date para a "data do dia" (yyyy-MM-dd) usada em filtros/comparações
 *  - exibir data ou hora ao usuário (independe do fuso do navegador)
 *  - obter o "agora" no fuso do Brasil para comparações de hoje/turno
 *
 * Nunca use `new Date(iso).getFullYear/Month/Date/Hours` para lógica de
 * data — isso depende do fuso do navegador e gera erros na virada do dia.
 */

export const BR_TZ = "America/Sao_Paulo";

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BR_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateOnlyFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BR_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeOnlyFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BR_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Retorna a data (yyyy-MM-dd) no fuso de Brasília a partir de um ISO ou Date. */
export function brDateOf(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return ymdFmt.format(d);
}

/** Formata data+hora no fuso de Brasília como dd/MM/yyyy HH:mm. */
export function formatBRDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return dateTimeFmt.format(d).replace(",", "");
}

/** Formata apenas a data no fuso de Brasília como dd/MM/yyyy. */
export function formatBRDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return dateOnlyFmt.format(d);
}

/** Formata apenas o horário no fuso de Brasília como HH:mm. */
export function formatBRTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return timeOnlyFmt.format(d);
}

interface BRParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Decompõe um instante em year/month/day/hour/minute/second no fuso BRT. */
export function brPartsOf(input: string | Date = new Date()): BRParts {
  const d = typeof input === "string" ? new Date(input) : input;
  const parts = partsFmt.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** "Hoje" como yyyy-MM-dd no fuso de Brasília. */
export function brTodayYMD(): string {
  return ymdFmt.format(new Date());
}

/** Hora atual em BRT (0-23). */
export function brNowHour(): number {
  return brPartsOf().hour;
}

/** Minuto atual em BRT (0-59). */
export function brNowMinute(): number {
  return brPartsOf().minute;
}

/** Converte um Date local (vindo de um date-picker) para yyyy-MM-dd estável.
 *  Como o date-picker produz Date com hora local 00:00, usamos os componentes
 *  locais — equivalente ao que o usuário vê no calendário. */
export function pickedDateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
