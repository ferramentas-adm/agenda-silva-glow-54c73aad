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
  follow_up: boolean;
  follow_up_date: string | null;
  follow_up_time: string | null;
  observacoes: string | null;
  outcome: "fechou" | "perdeu" | "follow_up" | "em_andamento";
  registered_at: string;
  lead_revenue?: string | null;
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
  try {
    await retryWithBackoff(
      async () => {
        const { error } = await supabase.functions.invoke("datacrazy-venda-webhook", {
          body: payload,
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
