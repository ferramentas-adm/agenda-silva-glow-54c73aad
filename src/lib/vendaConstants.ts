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
