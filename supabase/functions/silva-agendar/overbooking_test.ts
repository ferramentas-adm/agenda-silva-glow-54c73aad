import {
  OVERBOOKING_EXTRA,
  isSdrIaHourFull,
  sdrIaOverbookingPosition,
} from "../_shared/disponibilidade.ts";

Deno.test("mantém três vagas extras após a lotação normal", () => {
  const capacity = 4;
  if (OVERBOOKING_EXTRA !== 3) throw new Error("OVERBOOKING_EXTRA deve ser 3");
  if (isSdrIaHourFull(4, capacity, capacity)) throw new Error("a primeira extra deve estar disponível");
  if (isSdrIaHourFull(5, capacity, capacity)) throw new Error("a segunda extra deve estar disponível");
  if (isSdrIaHourFull(6, capacity, capacity)) throw new Error("a terceira extra deve estar disponível");
  if (!isSdrIaHourFull(7, capacity, capacity)) throw new Error("a quarta extra deve ser bloqueada");
});

Deno.test("marca a posição correta do overbooking", () => {
  const capacity = 4;
  const positions = [0, 1, 2, 3, 4, 5, 6].map((count) =>
    sdrIaOverbookingPosition(count, capacity)
  );
  const expected = [0, 0, 0, 0, 1, 2, 3];
  if (JSON.stringify(positions) !== JSON.stringify(expected)) {
    throw new Error(`posições incorretas: ${JSON.stringify(positions)}`);
  }
});

Deno.test("não oferece horário sem closer elegível", () => {
  if (!isSdrIaHourFull(0, 0, 0)) throw new Error("horário bloqueado deve ficar indisponível");
});