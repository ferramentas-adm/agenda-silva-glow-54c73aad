// Moderadores que atuam prioritariamente como SDR e, portanto, devem
// aparecer em todas as métricas/listas/rankings de SDR (Métricas SDRs,
// Ranking SDRs, Produtividade SDR, Erros SDR etc.).
//
// A correspondência é feita pelo `full_name` do profile (case-insensitive,
// ignorando acentos), evitando depender de IDs fixos por ambiente.
export const SDR_OVERRIDE_NAMES: string[] = [
  "Lucas Emanuel",
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const OVERRIDE_SET = new Set(SDR_OVERRIDE_NAMES.map(normalize));

export function isSdrOverrideName(fullName?: string | null): boolean {
  if (!fullName) return false;
  return OVERRIDE_SET.has(normalize(fullName));
}
