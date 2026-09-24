import { supabase } from "@/integrations/supabase/client";

/**
 * Exceções pontuais de bloqueios de closers ("liberar horário").
 *
 * Um gestor pode liberar um horário bloqueado apenas em uma data específica.
 * Para bloqueios pontuais o registro em `closer_blocks` é removido; para
 * bloqueios recorrentes criamos uma exceção em `closer_block_exceptions`,
 * que deve ser subtraída do bloqueio ao calcular disponibilidade.
 */
export type BlockLike = {
  id?: string | null;
  closer_id?: string | null;
  is_recurring?: boolean | null;
  start_time: string;
  end_time: string;
  [key: string]: unknown;
};

export type BlockException = {
  block_id?: string | null;
  closer_id: string;
  start_time: string;
  end_time: string;
};

const toMin = (t?: string | null): number => {
  const s = String(t ?? "00:00");
  const h = parseInt(s.slice(0, 2), 10) || 0;
  const m = parseInt(s.slice(3, 5), 10) || 0;
  return h * 60 + m;
};

const fromMin = (v: number): string =>
  `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

/** Busca as exceções de bloqueio válidas para uma data. */
export async function fetchBlockExceptions(
  dateStr: string,
  closerIds?: string[] | null,
): Promise<BlockException[]> {
  let query = supabase
    .from("closer_block_exceptions")
    .select("block_id, closer_id, start_time, end_time")
    .eq("exception_date", dateStr);
  if (closerIds && closerIds.length > 0) query = query.in("closer_id", closerIds);
  const { data } = await query;
  return (data ?? []) as BlockException[];
}

/**
 * Decide se uma exceção ("liberar horário") pode anular parte de um bloqueio.
 *
 * Regras:
 *  - a exceção só vale para o closer dela;
 *  - a exceção só vale para o bloqueio de onde ela nasceu (`block_id`);
 *  - bloqueios pontuais (não recorrentes) nunca são anulados por exceção —
 *    ao liberar um bloqueio pontual o registro é removido, então qualquer
 *    exceção antiga não deve apagar um bloqueio novo criado para a data.
 */
function exceptionApplies(b: BlockLike, ex: BlockException): boolean {
  if (b.closer_id && ex.closer_id && b.closer_id !== ex.closer_id) return false;
  if (b.is_recurring === false) return false;
  if (ex.block_id && b.id) return ex.block_id === b.id;
  // Sem vínculo conhecido: só aplica em bloqueio recorrente.
  return b.is_recurring === true;
}

/**
 * Subtrai as exceções dos bloqueios, retornando os intervalos realmente
 * bloqueados (um bloqueio pode ser dividido em dois se a liberação for no meio).
 */
export function applyBlockExceptions<T extends BlockLike>(
  blocks: T[],
  exceptions: BlockException[],
): T[] {
  if (!exceptions || exceptions.length === 0) return blocks;
  const result: T[] = [];
  for (const b of blocks) {
    let segments = [{ start: toMin(b.start_time), end: toMin(b.end_time) }];
    for (const ex of exceptions) {
      if (!exceptionApplies(b, ex)) continue;
      const cutStart = toMin(ex.start_time);
      const cutEnd = toMin(ex.end_time);
      segments = segments.flatMap((s) => {
        if (cutEnd <= s.start || cutStart >= s.end) return [s];
        const parts: { start: number; end: number }[] = [];
        if (cutStart > s.start) parts.push({ start: s.start, end: cutStart });
        if (cutEnd < s.end) parts.push({ start: cutEnd, end: s.end });
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

