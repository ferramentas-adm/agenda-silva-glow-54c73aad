export const FOLLOWUP_SELECT = `
  id, agendamento_id, follow_up_date, follow_up_time, follow_up_status,
  follow_up_canal, follow_up_temperatura, follow_up_produto, follow_up_valor,
  follow_up_condicoes, follow_up_tentativas, follow_up_event_id,
  follow_up_ultima_tentativa_em, follow_up_balde_em,
  motivo_nao_fechamento, explicacao_nao_fechamento, observacoes, valor,
  agendamentos!inner ( lead_name, lead_phone, closer_id, lead_desqualificado, closers ( name ) )
`;

export interface FollowUpRecord {
  id: string;
  agendamento_id: string;
  follow_up_date: string | null;
  follow_up_time: string | null;
  follow_up_status: string;
  follow_up_canal: string | null;
  follow_up_temperatura: string | null;
  follow_up_produto: string | null;
  follow_up_valor: number | null;
  follow_up_condicoes: string | null;
  follow_up_tentativas: number;
  follow_up_event_id: string | null;
  follow_up_ultima_tentativa_em: string | null;
  follow_up_balde_em: string | null;
  motivo_nao_fechamento: string | null;
  explicacao_nao_fechamento: string | null;
  observacoes: string | null;
  valor: number | null;
  agendamentos: {
    lead_name: string;
    lead_phone: string;
    closer_id: string | null;
    lead_desqualificado: boolean | null;
    closers: { name: string } | null;
  } | null;
}
