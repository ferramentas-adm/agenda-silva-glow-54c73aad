// Serializa qualquer erro (Error, PostgrestError, objeto solto) em texto legível.
// Sem isso, erros do banco viravam "[object Object]" no campo `detalhe`.
// deno-lint-ignore-file no-explicit-any
export function errorDetail(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as any;
    const parts = [o.message, o.details, o.hint, o.code ? `code=${o.code}` : null]
      .filter((p) => typeof p === "string" && p.length > 0);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
