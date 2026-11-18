/**
 * Neutraliza injeção de fórmula em CSV (=, +, -, @, tab, CR no início da célula).
 * Números/telefones puros (ex.: "+55 11 99999-0000", "-10,5") ficam intactos.
 */
export function csvSafe(value: unknown): string {
  const s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().,-]+$/.test(s)) return `'${s}`;
  return s;
}
