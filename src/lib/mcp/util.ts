/** Helpers compartilhados pelas ferramentas MCP. Nada de I/O ou env no topo do módulo. */

/** Data de hoje (YYYY-MM-DD) em America/Sao_Paulo. */
export function todayBRT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Período padrão: mês corrente em BRT quando nada é informado. */
export function resolvePeriod(from?: string, to?: string) {
  const today = todayBRT();
  const start = from ?? `${today.slice(0, 7)}-01`;
  const end = to ?? today;
  return { from: start, to: end };
}

export function cap(limit: number | undefined, def = 100, max = 500) {
  return Math.min(Math.max(limit ?? def, 1), max);
}

export function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export const NOT_AUTHENTICATED = "Não autenticado. Reconecte o conector para autorizar.";
