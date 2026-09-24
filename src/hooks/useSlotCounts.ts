import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessHours } from "@/hooks/useBusinessHours";
import { applyBlockExceptions, fetchBlockExceptions } from "@/lib/closerBlockExceptions";


/**
 * Informação de lotação por horário (HH:MM) em um dia específico.
 *
 * - `count`: número de slots já ocupados nesse horário — distintos closers com
 *   agendamento ativo + agendamentos sem closer atribuído (cada um consome 1).
 * - `capacity`: número de closers ativos disponíveis nesse horário
 *   (closers ativos − closers com bloqueio pessoal cobrindo o slot).
 * - `full`: true quando `count >= capacity` (ou capacidade = 0). Só nesse
 *   caso o SDR deve ser impedido de agendar.
 *
 * Status incluídos: agendada, confirmada, realizada, no_show, reagendada.
 * Excluídos: cancelada e soft-deletes.
 */
export type SlotInfo = {
  count: number;
  capacity: number;
  full: boolean;
};

export function useSlotCounts(dateStr: string | null | undefined, treinamento: boolean = false) {
  const { slots: businessSlots } = useBusinessHours();
  return useQuery<Map<string, SlotInfo>>({
    queryKey: ["slot-counts-v2", dateStr, businessSlots.join(","), treinamento],
    enabled: !!dateStr,
    staleTime: 30 * 1000,
    queryFn: async () => {
      // Weekday em horário local de SP para casar com closer_blocks recorrentes.
      const weekday = new Date(`${dateStr}T12:00:00-03:00`).getDay();

      const [agRes, closersRes, blocksRes, exceptions] = await Promise.all([
        supabase
          .from("agendamentos")
          .select("scheduled_time, closer_id")
          .eq("scheduled_date", dateStr!)
          .is("deleted_at", null)
          .neq("status", "cancelada"),
        supabase.from("closers").select("id, em_treinamento").eq("active", true),
        supabase
          .from("closer_blocks")
          .select("id, start_time, end_time, is_recurring, recurrence_weekday, block_date, closer_id")
          .or(
            `and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${weekday})`,
          ),
        fetchBlockExceptions(dateStr!),
      ]);
      if (agRes.error) throw agRes.error;
      if (closersRes.error) throw closersRes.error;
      if (blocksRes.error) throw blocksRes.error;

      const matchingClosers = (closersRes.data ?? []).filter((c: any) => !!c.em_treinamento === treinamento);
      const matchingCloserIds = new Set<string>(matchingClosers.map((c: any) => c.id));
      const activeCount = matchingClosers.length;
      const blocks = applyBlockExceptions((blocksRes.data ?? []) as any[], exceptions);


      type Acc = { closerIds: Set<string>; unassigned: number };
      const byTime = new Map<string, Acc>();
      for (const r of (agRes.data ?? []) as any[]) {
        const t = String(r.scheduled_time ?? "").slice(0, 5);
        if (!t) continue;
        // Só conta agendamentos alocados a closers do mesmo recorte ou sem closer.
        if (r.closer_id && !matchingCloserIds.has(r.closer_id)) continue;
        const acc = byTime.get(t) ?? { closerIds: new Set<string>(), unassigned: 0 };
        if (r.closer_id) acc.closerIds.add(r.closer_id);
        else acc.unassigned += 1;
        byTime.set(t, acc);
      }

      const blockedActiveAt = (slot: string): number => {
        const slotH = parseInt(slot.slice(0, 2), 10);
        if (Number.isNaN(slotH)) return 0;
        const blocked = new Set<string>();
        for (const b of blocks) {
          if (!b.closer_id || !matchingCloserIds.has(b.closer_id)) continue;
          const startH = parseInt(String(b.start_time ?? "00").slice(0, 2), 10);
          const endH = parseInt(String(b.end_time ?? "00").slice(0, 2), 10);
          const endM = parseInt(String(b.end_time ?? "00").slice(3, 5), 10) || 0;
          const endHourExclusive = endM > 0 ? endH + 1 : endH;
          if (slotH >= startH && slotH < endHourExclusive) blocked.add(b.closer_id);
        }
        return blocked.size;
      };

      // Garante entradas para todos os slots do horário comercial configurado.
      const slots = new Set<string>(byTime.keys());
      for (const s of businessSlots) slots.add(s);

      const result = new Map<string, SlotInfo>();
      for (const slot of slots) {
        const acc = byTime.get(slot) ?? { closerIds: new Set<string>(), unassigned: 0 };
        const count = acc.closerIds.size + acc.unassigned;
        const capacity = Math.max(0, activeCount - blockedActiveAt(slot));
        const full = capacity === 0 ? count > 0 : count >= capacity;
        result.set(slot, { count, capacity, full });
      }
      return result;
    },
  });
}
