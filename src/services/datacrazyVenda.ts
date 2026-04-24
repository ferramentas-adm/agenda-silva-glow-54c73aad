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
 */
export async function sendVendaToDataCrazy(payload: VendaWebhookPayload) {
  try {
    const { error } = await supabase.functions.invoke("datacrazy-venda-webhook", {
      body: payload,
    });
    if (error) console.warn("[datacrazy-venda-webhook] erro não-bloqueante:", error);
  } catch (err) {
    console.warn("[datacrazy-venda-webhook] falha de rede:", err);
  }
}
