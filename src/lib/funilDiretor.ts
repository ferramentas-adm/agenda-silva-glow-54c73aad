// Funil "Diretor Comercial": o SDR envia o nome do lead prefixado por "🔴 DIRETOR · ".
// Também aceitamos a marca gravada nas observações (funil=diretor no /silva-agendar).

const PREFIX_RE = /^\s*(?:\p{Extended_Pictographic}|\uFE0F|\u200D)*\s*diretor\s*(?:·|-|:|\u2022)?\s*/iu;

export type FunilFilterValue = "todos" | "diretor" | "imersao" | "padrao";

interface FunilSource {
  lead_name?: string | null;
  observation?: string | null;
}

export function isDiretor(ag: FunilSource | null | undefined): boolean {
  if (!ag) return false;
  const name = ag.lead_name ?? "";
  if (PREFIX_RE.test(name)) return true;
  const obs = (ag.observation ?? "").toLowerCase();
  return obs.includes("funil: diretor");
}

export function stripDiretorPrefix(name: string | null | undefined): string {
  const value = name ?? "";
  return PREFIX_RE.test(value) ? value.replace(PREFIX_RE, "").trim() : value;
}

export const DIRETOR_TOOLTIP = "Funil Diretor Comercial — oferta R$10 mil";

// Funil "Imersão de 2 dias": marca "Funil: imersao" nas observações (/silva-agendar)
// ou o texto "IMERSÃO DE 2 DIAS" no briefing (cobre reuniões antigas).
const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function isImersao(ag: (FunilSource & { briefing?: string | null }) | null | undefined): boolean {
  if (!ag) return false;
  if (norm(ag.observation).includes("funil: imersao")) return true;
  return norm(ag.briefing).includes("imersao de 2 dias");
}

export const IMERSAO_LABEL = "Imersão 2 dias";
