import { describe, expect, it } from "vitest";
import { isPerfilQueCompra } from "@/lib/funilDiretor";

describe("isPerfilQueCompra", () => {
  it("reconhece o briefing ignorando maiúsculas e acentos", () => {
    expect(isPerfilQueCompra({ briefing: "Origem: PERFIL QUE COMPRA" })).toBe(true);
    expect(isPerfilQueCompra({ briefing: "perfil que compra" })).toBe(true);
    expect(isPerfilQueCompra({ briefing: "PERFIL QUE COMPRÁ" })).toBe(true);
  });

  it("só olha o briefing, nunca as observações", () => {
    expect(isPerfilQueCompra({ briefing: "parceria comercial" })).toBe(false);
    expect(isPerfilQueCompra({ briefing: "Funil: parceria" })).toBe(false);
    expect(isPerfilQueCompra({ briefing: null })).toBe(false);
    expect(isPerfilQueCompra(null)).toBe(false);
  });
});
