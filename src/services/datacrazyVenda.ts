import { supabase } from "@/integrations/supabase/client";

export interface VendaWebhookPayload {
  agendamento_id: string;
  lead_name: string;
  lead_phone?: string | null;
  closer_name?: string | null;
  sdr_name?: string | null;
  vendeu: boolean;
  resumo_venda: string | null;
  valor: number | null;
  motivo_nao_fechamento: string | null;
  venda_origem?: "primeira_call" | "follow_up" | null;
  explicacao_nao_fechamento?: string | null;
  follow_up: boolean;
  follow_up_date: string | null;
  follow_up_time: string | null;
  observacoes: string | null;
  outcome: "fechou" | "perdeu" | "follow_up" | "em_andamento";
  status?: "Follow-up" | "Perdido" | "Vendido" | null;
  registered_at: string;
  lead_revenue?: string | null;
  valor_apresentado?: number | null;
  recebimento_acordado?: boolean;
  valor_previsto?: number | null;
  data_prevista?: string | null;
  // Campos alinhados ao webhook `reuniao_realizada` (adicionados automaticamente
  // para outcomes "fechou" / "perdeu").
  evento?: string;
  pipeline_acao?: string;
  status_novo?: string;
  timestamp?: string;
  is_vendeu?: boolean;
  motivo_status?: string;
}

/**
 * Registra o resultado da reunião na fila de auditoria do DataCrazy
 * via edge function `datacrazy-venda-webhook`.
 *
 * O envio em tempo real está desativado: o CRM é atualizado exclusivamente
 * pelo lote diário. O registro local da venda nunca depende desta chamada.
 */
export async function sendVendaToDataCrazy(payload: VendaWebhookPayload) {
  // Para desfechos "fechou" e "perdeu", alinha o payload ao formato do webhook
  // `reuniao_realizada` (usado pelo CRM em src/services/datacrazy.ts) e
  // adiciona `is_vendeu`. Demais outcomes seguem como estavam.
  const enriched: VendaWebhookPayload =
    payload.outcome === "fechou" || payload.outcome === "perdeu"
      ? {
          ...payload,
          evento: "status_atualizado",
          pipeline_acao: "reuniao_realizada",
          status_novo: "realizada",
          timestamp: new Date().toISOString(),
          is_vendeu: payload.outcome === "fechou",
          ...(payload.outcome === "perdeu"
            ? { motivo_status: "nao-venda perdida" }
            : {}),
        }
      : payload;

  try {
    const { error } = await supabase.functions.invoke("datacrazy-venda-webhook", {
      body: enriched,
    });
    if (error) throw error;
  } catch (err) {
    console.warn("[datacrazy-venda-webhook] registro não-bloqueante falhou:", err);
  }
}
