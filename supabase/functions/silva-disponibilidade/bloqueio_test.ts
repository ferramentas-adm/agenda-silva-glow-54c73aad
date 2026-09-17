// Garante que hora com compromisso/bloqueio nunca vira slot oferecido.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isCloserBlocked, loadDayAvailability, suggestFreeCloser } from "../_shared/disponibilidade.ts";

const DATE = "2026-09-17"; // quinta-feira (weekday 4)

// Stub mínimo do client: devolve dados fixos por tabela.
function stub(rows: Record<string, unknown[]>) {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "neq", "is", "in", "or", "gte", "lte", "order", "limit"]) {
      chain[m] = self;
    }
    chain.then = (res: (v: unknown) => void) => res({ data: rows[table] ?? [], error: null });
    return chain;
  };
  return { from: (t: string) => builder(t) } as never;
}

const closers = [
  { id: "c1", name: "Leandro", em_treinamento: false },
  { id: "c2", name: "Vitor", em_treinamento: false },
];

Deno.test("closer com bloqueio na hora não é oferecido", async () => {
  const avail = await loadDayAvailability(
    stub({
      agendamentos: [],
      closers,
      closer_blocks: [
        { closer_id: "c1", start_time: "09:00", end_time: "10:00" },
        { closer_id: "c2", start_time: "09:00", end_time: "10:00" },
      ],
      closer_block_exceptions: [],
      app_settings: [
        { key: "business_hours_start", value: "09:00" },
        { key: "business_hours_end", value: "10:00" },
      ],
    }),
    DATE,
  );
  assertEquals(isCloserBlocked(avail, "09:00", "c1"), true);
  assertEquals(avail.hours.get("09:00")!.freeClosers.length, 0);
  assertEquals(suggestFreeCloser(avail, "09:00"), null);
  // Hora livre continua sendo oferecida.
  assertEquals(suggestFreeCloser(avail, "10:00")?.id, "c1");
});

Deno.test("closer com reunião mas sem bloqueio segue elegível, não livre", async () => {
  const avail = await loadDayAvailability(
    stub({
      agendamentos: [{ scheduled_time: "09:00", closer_id: "c1", lead_desqualificado: false }],
      closers,
      closer_blocks: [],
      closer_block_exceptions: [],
      app_settings: [
        { key: "business_hours_start", value: "09:00" },
        { key: "business_hours_end", value: "10:00" },
      ],
    }),
    DATE,
  );
  const info = avail.hours.get("09:00")!;
  assertEquals(info.blockedCloserIds.size, 0);
  assertEquals(info.freeClosers.map((c) => c.id), ["c2"]);
  assertEquals(suggestFreeCloser(avail, "09:00")?.id, "c2");
});
