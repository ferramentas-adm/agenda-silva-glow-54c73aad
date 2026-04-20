import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_REASONS = [
  { label: "Agendamento duplicado", restricted: false },
  { label: "Data errada", restricted: false },
  { label: "Teste", restricted: true },
];

export interface DeletionReason {
  label: string;
  restricted: boolean; // se true, só gestor/moderador podem usar
}

export function parseDeletionReasons(raw: string | null | undefined): DeletionReason[] {
  if (!raw) return DEFAULT_REASONS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_REASONS;
    return parsed
      .map((item: any) => {
        if (typeof item === "string") return { label: item, restricted: false };
        if (item && typeof item.label === "string") {
          return { label: item.label, restricted: !!item.restricted };
        }
        return null;
      })
      .filter((r): r is DeletionReason => !!r && r.label.trim().length > 0);
  } catch {
    return DEFAULT_REASONS;
  }
}

export function useDeletionReasons() {
  return useQuery({
    queryKey: ["app-settings", "deletion_reasons"],
    queryFn: async (): Promise<DeletionReason[]> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "deletion_reasons")
        .maybeSingle();
      return parseDeletionReasons(data?.value);
    },
    staleTime: 60 * 1000,
  });
}

export const DEFAULT_DELETION_REASONS = DEFAULT_REASONS;
