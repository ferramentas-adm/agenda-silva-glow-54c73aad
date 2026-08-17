// Regra única de quem conta como SDR nas listas/rankings/métricas do sistema:
// - função "sdr"; ou
// - qualquer outra função com a marcação "Atua como SDR" (profiles.is_sdr_override);
// - "gestor" NUNCA conta como SDR, mesmo com a marcação ligada (função de gestão).
export function countsAsSdr(opts: {
  role?: string | null;
  isOverride?: boolean | null;
  fullName?: string | null;
}): boolean {
  if (opts.role === "gestor") return false;
  if (opts.role === "sdr") return true;
  return opts.isOverride === true;
}
