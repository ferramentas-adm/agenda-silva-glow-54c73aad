import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/retryWithBackoff";

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
 * Envia o resultado da reunião (venda) para o webhook do DataCrazy
 * via edge function `datacrazy-venda-webhook`.
 *
 * Retry com backoff exponencial (3 tentativas, 10s timeout cada) para
 * resistir a 502/503/504 transitórios. Erros finais são apenas logados —
 * o registro local da venda já está salvo no banco.
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
    await retryWithBackoff(
      async () => {
        const { error } = await supabase.functions.invoke("datacrazy-venda-webhook", {
          body: enriched,
        });
        if (error) {
          const wrapped = new Error(error.message) as Error & { status?: number };
          wrapped.status = (error as { status?: number }).status;
          throw wrapped;
        }
      },
      { label: "datacrazy-venda-webhook" },
    );
  } catch (err) {
    console.warn("[datacrazy-venda-webhook] falha após retries (não-bloqueante):", err);
  }
}
