import { describe, expect, it } from "vitest";
import { buildFollowUpEncerramento } from "@/lib/followUpEncerramento";

describe("Fechou no follow-up", () => {
  it("preserva valor e data informados no encerramento", () => {
    const result = buildFollowUpEncerramento(10000, "2026-10-26", "Contato encerrado");
    expect(result.update.follow_up_valor).toBe(10000);
    expect(result.audit.data_venda).toBe("2026-10-26");
    expect(result.update.follow_up_status).toBe("concluido");
    expect(result.update.follow_up).toBe(false);
  });

  it("não lança nem sobrescreve uma venda manual no dashboard", () => {
    const result = buildFollowUpEncerramento(10000, "2026-10-26", null);
    for (const field of ["vendeu", "valor", "closed_at", "produto", "resumo_venda"]) {
      expect(result.update).not.toHaveProperty(field);
    }
    expect(result.audit.lancamento_venda).toBe(false);
  });
});