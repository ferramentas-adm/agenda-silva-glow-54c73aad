/** Encerra o contato sem escrever campos contábeis de venda. */
export function buildFollowUpEncerramento(valor: number, data: string, observacoes: string | null) {
  return {
    update: {
      follow_up: false,
      follow_up_date: null,
      follow_up_time: null,
      follow_up_status: "concluido",
      follow_up_valor: valor,
      observacoes,
    },
    audit: { valor, data_venda: data, lancamento_venda: false },
  };
}