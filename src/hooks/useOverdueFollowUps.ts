import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCloserId } from "@/hooks/useMyCloserId";
import { brTodayYMD } from "@/lib/timezone";
import { diasUteisDeAtraso } from "@/lib/followUp";
import { FOLLOWUP_SELECT, type FollowUpRecord } from "@/components/followup/types";

export interface OverdueFollowUp {
  id: string;
  agendamento_id: string;
  follow_up_date: string;
  follow_up_time: string | null;
  motivo_nao_fechamento: string | null;
  observacoes: string | null;
  lead_name: string;
  lead_phone: string;
  /** Dias úteis passados desde a data combinada (sábado/domingo não contam). */
  dias_uteis_atraso: number;
  /** Registro completo, para reaproveitar os diálogos do módulo. */
  record: FollowUpRecord;
}

export function useOverdueFollowUps() {
  const { role } = useAuth();
  const isCloser = role === "closer";
  const { data: myCloserId } = useMyCloserId();

  const today = (() => {
    try {
      return brTodayYMD();
    } catch {
      return format(new Date(), "yyyy-MM-dd");
    }
  })();

  const { data = [], refetch } = useQuery({
    queryKey: ["overdue-follow-ups", myCloserId, today],
    enabled: isCloser && !!myCloserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(FOLLOWUP_SELECT)
        .eq("follow_up", true)
        .eq("vendeu", false)
        .eq("follow_up_status", "ativo")
        .lt("follow_up_date", today)
        .eq("agendamentos.closer_id", myCloserId);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        agendamento_id: r.agendamento_id,
        follow_up_date: r.follow_up_date,
        follow_up_time: r.follow_up_time,
        motivo_nao_fechamento: r.motivo_nao_fechamento,
        observacoes: r.observacoes,
        lead_name: r.agendamentos?.lead_name ?? "",
        lead_phone: r.agendamentos?.lead_phone ?? "",
        dias_uteis_atraso: diasUteisDeAtraso(r.follow_up_date ?? "", today),
        record: r as FollowUpRecord,
      })) as OverdueFollowUp[];
    },
  });

  return { items: data, count: data.length, refetch };
}
