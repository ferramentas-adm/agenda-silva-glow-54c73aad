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
  closer_id?: string | null;
  start_time: string;
  end_time: string;
  [key: string]: unknown;
};

export type BlockException = {
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
    .select("closer_id, start_time, end_time")
    .eq("exception_date", dateStr);
  if (closerIds && closerIds.length > 0) query = query.in("closer_id", closerIds);
  const { data } = await query;
  return (data ?? []) as BlockException[];
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
      if (b.closer_id && ex.closer_id && b.closer_id !== ex.closer_id) continue;
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
