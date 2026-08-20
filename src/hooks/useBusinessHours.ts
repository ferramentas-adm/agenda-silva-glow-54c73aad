import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_BUSINESS_START = "09:00";
export const DEFAULT_BUSINESS_END = "23:00";

function hourOf(t: string, fallback: number): number {
  const h = parseInt(String(t ?? "").slice(0, 2), 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : fallback;
}

export function buildHourSlots(start: string, end: string): string[] {
  const sh = hourOf(start, 9);
  const eh = hourOf(end, 23);
  const from = Math.min(sh, eh);
  const to = Math.max(sh, eh);
  const slots: string[] = [];
  for (let h = from; h <= to; h++) slots.push(`${String(h).padStart(2, "0")}:00`);
  return slots;
}

/**
 * Horário comercial global configurado em Administração > Configurações Gerais
 * (`app_settings.business_hours_start` / `business_hours_end`).
 * Fonte única dos slots exibidos no Calendário e na tela de Agendar.
 */
export function useBusinessHours() {
  const { data, isLoading } = useQuery({
    queryKey: ["business-hours-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["business_hours_start", "business_hours_end"]);
      const map = new Map((data ?? []).map((r: any) => [r.key, r.value]));
      return {
        start: map.get("business_hours_start") || DEFAULT_BUSINESS_START,
        end: map.get("business_hours_end") || DEFAULT_BUSINESS_END,
      };
    },
  });

  const start = data?.start ?? DEFAULT_BUSINESS_START;
  const end = data?.end ?? DEFAULT_BUSINESS_END;

  return {
    start,
    end,
    startHour: hourOf(start, 9),
    endHour: hourOf(end, 23),
    slots: buildHourSlots(start, end),
    isLoading,
  };
}
