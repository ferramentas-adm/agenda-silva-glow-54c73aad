import { supabase } from "@/integrations/supabase/client";

interface FollowUpEventInput {
  closer_id: string;
  lead_name: string;
  lead_phone?: string | null;
  canal?: string | null;
  data: string;
  hora: string;
  produto?: string | null;
  valor?: string | null;
  condicoes?: string | null;
  temperatura?: string | null;
  tentativa?: number | null;
  existing_event_id?: string | null;
}

/**
 * Cria/atualiza o compromisso do follow-up na agenda corporativa do closer.
 * Best-effort: qualquer falha apenas devolve null (nunca bloqueia o registro).
 */
export async function upsertFollowUpCalendarEvent(
  input: FollowUpEventInput,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("followup-calendar-event", {
      body: input,
    });
    if (error) {
      console.error("followup-calendar-event falhou:", error);
      return null;
    }
    if (!data?.success) {
      console.warn("followup-calendar-event sem evento:", data);
      return null;
    }
    return (data.event_id as string) ?? null;
  } catch (err) {
    console.error("followup-calendar-event erro:", err);
    return null;
  }
}
