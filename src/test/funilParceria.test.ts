import { describe, expect, it } from "vitest";
import { isParceria } from "@/lib/funilDiretor";

describe("isParceria", () => {
  it("reconhece o briefing ignorando maiúsculas e acentos", () => {
    expect(isParceria({ briefing: "Origem: PARCERIA COMERCIAL" })).toBe(true);
    expect(isParceria({ briefing: "parceria comercial" })).toBe(true);
    expect(isParceria({ briefing: "PARCERÍA COMERCIAL" })).toBe(true);
  });

  it("reconhece a marca própria do funil nas observações", () => {
    expect(isParceria({ observation: "Agendado pelo SDR | Funil: parceria" })).toBe(true);
  });

  it("não classifica outros funis como parceria", () => {
    expect(isParceria({ observation: "Funil: imersao", briefing: "Imersão de 2 dias" })).toBe(false);
  });
});