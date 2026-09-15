// Regra de disponibilidade da tela "Agendar", portada para o servidor.
// Fonte: src/hooks/useSlotCounts.ts, src/hooks/useBusinessHours.ts,
// src/lib/closerBlockExceptions.ts e a revalidação em AgendarPage.handleSubmit.
//
// - Grade: horas cheias entre app_settings.business_hours_start/end (default 09:00–23:00).
// - count = total de agendamentos ativos no horário.
// - capacity = closers ativos − closers com bloqueio pessoal cobrindo a hora
//   (closer_blocks pontuais + recorrentes, menos closer_block_exceptions da data).
// - No SDR IA, lotado quando count >= capacity + OVERBOOKING_EXTRA.

// deno-lint-ignore-file no-explicit-any
export const TZ = "America/Sao_Paulo";
export const BOOKING_MIN_LEAD_MINUTES = 1;
export const AVAILABILITY_MIN_LEAD_MINUTES = 10;
export const OVERBOOKING_EXTRA = 3;
/** Teto de reuniões por horário na Turma B (10 closers em treinamento). */
export const TURMA_B_MAX_PER_HOUR = 13;
/** Janela de atendimento da Turma B (horas cheias, inclusive). */
export const TURMA_B_WINDOW_START_HOUR = 10;
export const TURMA_B_WINDOW_END_HOUR = 21;

export function isWithinTurmaBWindow(slot: string): boolean {
  const h = parseInt(slot.slice(0, 2), 10);
  return h >= TURMA_B_WINDOW_START_HOUR && h <= TURMA_B_WINDOW_END_HOUR;
}

export function isSdrIaHourFull(count: number, capacity: number, eligibleClosers: number): boolean {
  return eligibleClosers === 0 || count >= capacity + OVERBOOKING_EXTRA;
}

export function sdrIaOverbookingPosition(countBeforeInsert: number, capacity: number): number {
  return Math.max(0, countBeforeInsert - capacity + 1);
}

export interface Closer { id: string; name: string }
export interface HourInfo {
  count: number;
  capacity: number;
  full: boolean;
  /** Closers ativos livres nessa hora (sem agendamento e sem bloqueio). */
  freeClosers: Closer[];
  /** Closers ativos elegíveis nessa hora; podem já ter reunião no overbooking. */
  eligibleClosers: Closer[];
  /** Quantidade de reuniões ativas por closer nesta hora. */
  perCloserHour: Map<string, number>;
}
export interface DayAvailability {
  dateStr: string;
  slots: string[]; // grade HH:MM
  hours: Map<string, HourInfo>;
  /** Agendamentos ativos no dia por closer (para desempate da sugestão). */
  perCloserDay: Map<string, number>;
  closers: Closer[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (t?: string | null) => {
  const s = String(t ?? "00:00");
  return (parseInt(s.slice(0, 2), 10) || 0) * 60 + (parseInt(s.slice(3, 5), 10) || 0);
};
const fromMin = (v: number) => `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;

/** Partes de data/hora de um instante no fuso de São Paulo. */
export function spParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(hour, 10),
    minute: parseInt(get("minute"), 10),
    timeStr: `${hour}:${get("minute")}`,
  };
}

/** Offset (em minutos) de São Paulo em um instante. */
function spOffsetMinutes(d: Date): number {
  const p = spParts(d);
  const asUtc = Date.UTC(
    parseInt(p.dateStr.slice(0, 4), 10), parseInt(p.dateStr.slice(5, 7), 10) - 1,
    parseInt(p.dateStr.slice(8, 10), 10), p.hour, p.minute,
  );
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** Constrói o instante (Date) de `YYYY-MM-DD HH:MM` em São Paulo. */
export function spDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = spOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

/** ISO 8601 com o fuso de São Paulo (ex.: 2026-09-11T17:00:00-03:00). */
export function toSpIso(d: Date): string {
  const p = spParts(d);
  const off = spOffsetMinutes(d);
  const sign = off <= 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${p.dateStr}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function buildHourSlots(start: string, end: string): string[] {
  const h = (t: string, fb: number) => {
    const v = parseInt(String(t ?? "").slice(0, 2), 10);
    return Number.isFinite(v) && v >= 0 && v <= 23 ? v : fb;
  };
  const sh = h(start, 9), eh = h(end, 23);
  const out: string[] = [];
  for (let x = Math.min(sh, eh); x <= Math.max(sh, eh); x++) out.push(`${pad(x)}:00`);
  return out;
}

export async function fetchBusinessSlots(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from("app_settings").select("key, value")
    .in("key", ["business_hours_start", "business_hours_end"]);
  const map = new Map<string, string>((data ?? []).map((r: any) => [r.key, r.value]));
  return buildHourSlots(map.get("business_hours_start") || "09:00", map.get("business_hours_end") || "23:00");
}

type Block = { closer_id: string | null; start_time: string; end_time: string };
type Exc = { closer_id: string; start_time: string; end_time: string };

/** Idêntico a src/lib/closerBlockExceptions.applyBlockExceptions. */
export function applyBlockExceptions<T extends Block>(blocks: T[], exceptions: Exc[]): T[] {
  if (!exceptions.length) return blocks;
  const result: T[] = [];
  for (const b of blocks) {
    let segments = [{ start: toMin(b.start_time), end: toMin(b.end_time) }];
    for (const ex of exceptions) {
      if (b.closer_id && ex.closer_id && b.closer_id !== ex.closer_id) continue;
      const cs = toMin(ex.start_time), ce = toMin(ex.end_time);
      segments = segments.flatMap((s) => {
        if (ce <= s.start || cs >= s.end) return [s];
        const parts: { start: number; end: number }[] = [];
        if (cs > s.start) parts.push({ start: s.start, end: cs });
        if (ce < s.end) parts.push({ start: ce, end: s.end });
        return parts;
      });
    }
    for (const s of segments) {
      if (s.end <= s.start) continue;
      result.push({ ...b, start_time: fromMin(s.start), end_time: fromMin(s.end) });
    }
  }
  return result;
}

/** Calcula a lotação de todas as horas de um dia (mesma regra de useSlotCounts). */
export type Turma = "A" | "B";

export async function loadDayAvailability(
  supabase: any,
  dateStr: string,
  businessSlots?: string[],
  turma: Turma = "A",
): Promise<DayAvailability> {
  const isB = turma === "B";
  const allBusinessSlots = businessSlots ?? (await fetchBusinessSlots(supabase));
  const slots = isB ? allBusinessSlots.filter(isWithinTurmaBWindow) : allBusinessSlots;
  const weekday = weekdayOf(dateStr);
  const [agRes, closersRes, blocksRes, excRes] = await Promise.all([
    supabase.from("agendamentos").select("scheduled_time, closer_id, lead_desqualificado")
      .eq("scheduled_date", dateStr).is("deleted_at", null).neq("status", "cancelada"),
    // Turma A (padrão) atende lead qualificado; Turma B (em treinamento) só lead desqualificado.
    supabase.from("closers").select("id, name, em_treinamento").eq("active", true).order("name"),
    supabase.from("closer_blocks").select("start_time, end_time, closer_id")
      .or(`and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${weekday})`),
    supabase.from("closer_block_exceptions").select("closer_id, start_time, end_time").eq("exception_date", dateStr),
  ]);
  for (const r of [agRes, closersRes, blocksRes, excRes]) if (r.error) throw r.error;

  const closers: Closer[] = (closersRes.data ?? [])
    .filter((c: any) => Boolean(c.em_treinamento) === isB)
    .map((c: any) => ({ id: c.id, name: c.name }));
  const activeIds = new Set(closers.map((c) => c.id));
  const blocks = applyBlockExceptions((blocksRes.data ?? []) as Block[], (excRes.data ?? []) as Exc[]);

  const byTime = new Map<string, { closerIds: Set<string>; perCloser: Map<string, number>; unassigned: number; total: number }>();
  const perCloserDay = new Map<string, number>();
  for (const r of (agRes.data ?? []) as any[]) {
    const t = String(r.scheduled_time ?? "").slice(0, 5);
    if (!t) continue;
    // Lotação independente por turma: só conta o que pertence a esta turma.
    if (r.closer_id) {
      if (!activeIds.has(r.closer_id)) continue;
    } else if (Boolean(r.lead_desqualificado) !== isB) continue;
    const acc = byTime.get(t) ?? { closerIds: new Set<string>(), perCloser: new Map<string, number>(), unassigned: 0, total: 0 };
    acc.total += 1;
    if (r.closer_id) {
      acc.closerIds.add(r.closer_id);
      acc.perCloser.set(r.closer_id, (acc.perCloser.get(r.closer_id) ?? 0) + 1);
      perCloserDay.set(r.closer_id, (perCloserDay.get(r.closer_id) ?? 0) + 1);
    } else acc.unassigned += 1;
    byTime.set(t, acc);
  }

  const blockedAt = (slot: string): Set<string> => {
    const slotH = parseInt(slot.slice(0, 2), 10);
    const out = new Set<string>();
    for (const b of blocks) {
      if (!b.closer_id || !activeIds.has(b.closer_id)) continue;
      const sH = parseInt(String(b.start_time).slice(0, 2), 10);
      const eH = parseInt(String(b.end_time).slice(0, 2), 10);
      const eM = parseInt(String(b.end_time).slice(3, 5), 10) || 0;
      const endEx = eM > 0 ? eH + 1 : eH;
      if (slotH >= sH && slotH < endEx) out.add(b.closer_id);
    }
    return out;
  };

  const allSlots = new Set<string>([...byTime.keys(), ...slots]);
  const hours = new Map<string, HourInfo>();
  for (const slot of allSlots) {
    const acc = byTime.get(slot) ?? { closerIds: new Set<string>(), perCloser: new Map<string, number>(), unassigned: 0, total: 0 };
    const blocked = blockedAt(slot);
    const count = acc.total;
    const capacity = Math.max(0, closers.length - blocked.size);
    const eligibleClosers = closers.filter((c) => !blocked.has(c.id));
    const full = isSdrIaHourFull(count, capacity, eligibleClosers.length)
      || (isB && (count >= TURMA_B_MAX_PER_HOUR || !isWithinTurmaBWindow(slot)));
    const freeClosers = closers.filter((c) => !blocked.has(c.id) && !acc.closerIds.has(c.id));
    hours.set(slot, { count, capacity, full, freeClosers, eligibleClosers, perCloserHour: acc.perCloser });
  }
  return { dateStr, slots, hours, perCloserDay, closers };
}

/** Closer sugerido: elegível e com menos reuniões na hora; desempata pela carga diária e nome. */
export function suggestCloser(day: DayAvailability, slot: string): Closer | null {
  const info = day.hours.get(slot);
  if (!info || info.eligibleClosers.length === 0) return null;
  return [...info.eligibleClosers].sort((a, b) => {
    const hourDiff = (info.perCloserHour.get(a.id) ?? 0) - (info.perCloserHour.get(b.id) ?? 0);
    if (hourDiff !== 0) return hourDiff;
    const dayDiff = (day.perCloserDay.get(a.id) ?? 0) - (day.perCloserDay.get(b.id) ?? 0);
    return dayDiff !== 0 ? dayDiff : a.name.localeCompare(b.name, "pt-BR");
  })[0];
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "hoje às 17h" | "amanhã (sábado) às 10h" | "segunda (14/09) às 15h" */
export function labelFor(dateStr: string, slot: string, todayStr: string): string {
  const h = parseInt(slot.slice(0, 2), 10);
  const m = slot.slice(3, 5);
  const hora = m && m !== "00" ? `${h}h${m}` : `${h}h`;
  if (dateStr === todayStr) return `hoje às ${hora}`;
  const wd = WEEKDAYS[weekdayOf(dateStr)];
  if (dateStr === addDays(todayStr, 1)) return `amanhã (${wd}) às ${hora}`;
  return `${wd} (${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}) às ${hora}`;
}
