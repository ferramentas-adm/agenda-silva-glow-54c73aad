import { describe, it, expect } from "vitest";
import { isDesfechoPendente, splitNicho } from "@/lib/vendaConstants";

describe("desfecho pendente do closer", () => {
  it("realizada pelo gestor sem registro do closer fica pendente", () => {
    expect(isDesfechoPendente("realizada", null)).toBe(true);
  });
  it("venda lançada pelo gestor sem declaração do closer fica pendente", () => {
    expect(isDesfechoPendente("realizada", { vendeu_closer: null, lead_revenue: null })).toBe(true);
  });
  it("closer declarou e informou faturamento: não pendente", () => {
    expect(isDesfechoPendente("realizada", { vendeu_closer: false, lead_revenue: "Abaixo de 10k/mês" })).toBe(false);
  });
  it("reunião não realizada nunca fica pendente", () => {
    expect(isDesfechoPendente("confirmada", null)).toBe(false);
  });
});

describe("nicho Outro", () => {
  it("texto livre volta como Outro + texto", () => {
    expect(splitNicho("Pet shop")).toEqual({ opt: "Outro", outro: "Pet shop" });
  });
});
