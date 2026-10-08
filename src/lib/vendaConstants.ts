/**
 * Motivos de não fechamento que representam etapas em andamento dentro do CRM
 * (NÃO são vendas perdidas — não exigem follow-up dentro do app).
 */
export const PENDING_STAGE_REASONS = ["Aguardando o pagamento", "Analisando o contrato"];

export const isPendingStageReason = (motivo: string | null | undefined) =>
  !!motivo && PENDING_STAGE_REASONS.includes(motivo);

export const DEFAULT_REASONS = [
  "Expectativas desalinhadas",
  "Não é o momento",
  "Sem capacidade financeira",
  "Aguardando o pagamento",
  "Analisando o contrato",
];

export const NICHO_OUTRO = "Outro";

/** Top 20 nichos com mais vendas (ranking por share) + "Outro" com texto livre. */
export const NICHO_OPTIONS = [
  "Educação, Mentorias, Cursos & Concursos",
  "Tecnologia, Software & SaaS",
  "Marketing, Agências & Tráfego Pago",
  "Consultoria & Assessoria Empresarial",
  "Saúde, Clínicas & Médicos",
  "Seguros, Consórcios & Planos de Saúde",
  "Direito & Advocacia",
  "Engenharia, Arquitetura & Construção",
  "Indústria, Fabricação & Metalurgia",
  "Estética, Beleza & Harmonização",
  "Contabilidade, Perícia & BPO Financeiro",
  "Imobiliário, Corretores & Leilões",
  "Energia Solar & Fotovoltaica",
  "Comércio Varejista & Moda",
  "Serviços Automotivos, Oficinas & Veículos",
  "Agronegócio, Pecuária & Veterinária",
  "Alimentos, Gastronomia & Restaurantes",
  "Logística, Transportes & Fretes",
  "Odontologia & Clínicas Odontológicas",
  "E-commerce, Marketplaces & Lojas Virtuais",
  NICHO_OUTRO,
] as const;

/** Converte o valor salvo em (opção do select, texto livre). */
export const splitNicho = (saved: string | null | undefined): { opt: string; outro: string } => {
  const s = (saved ?? "").trim();
  if (!s) return { opt: "", outro: "" };
  if ((NICHO_OPTIONS as readonly string[]).includes(s) && s !== NICHO_OUTRO) return { opt: s, outro: "" };
  return { opt: NICHO_OUTRO, outro: s.replace(/^Outro:\s*/i, "") };
};

/**
 * Reunião realizada com desfecho pendente do closer: o closer ainda não
 * declarou o resultado (vendeu?) ou não informou o faturamento do lead.
 * Acontece quando o gestor marca "Realizada" direto.
 */
export const isDesfechoPendente = (
  status: string | null | undefined,
  venda: { vendeu_closer?: boolean | null; lead_revenue?: string | null } | null | undefined,
) => status === "realizada" && (!venda || venda.vendeu_closer == null || !venda.lead_revenue);
