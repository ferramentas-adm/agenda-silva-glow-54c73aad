import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useBusinessHours } from "@/hooks/useBusinessHours";
import { applyBlockExceptions, fetchBlockExceptions } from "@/lib/closerBlockExceptions";


interface CloserSelectorProps {
  selectedDate: Date | undefined;
  selectedCloserId: string | null;
  onSelect: (closerId: string) => void;
  /** Se true, lista apenas closers em treinamento; se false, exclui treinamento. */
  treinamento?: boolean;
}

interface CloserWithAvailability {
  id: string;
  name: string;
  freeSlots: number;
  totalSlots: number;
}

// Slots fixos: 09h às 23h.
const FIXED_SLOTS: string[] = (() => {
  const arr: string[] = [];
  for (let h = 9; h <= 23; h++) arr.push(`${String(h).padStart(2, "0")}:00`);
  return arr;
})();

function countSlotsFromRanges(_ranges: { start: string; end: string }[]): number {
  return FIXED_SLOTS.length;
}

export default function CloserSelector({ selectedDate, selectedCloserId, onSelect, treinamento = false }: CloserSelectorProps) {
  const { slots: businessSlots } = useBusinessHours();
  const dateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: closers = [] } = useQuery<CloserWithAvailability[]>({
    queryKey: ["closers-availability", dateStr, businessSlots.join(","), treinamento],
    queryFn: async () => {
      let q = supabase
        .from("closers")
        .select("id, name, business_hours_start, business_hours_end, business_hours_ranges, em_treinamento")
        .eq("active", true)
        .eq("em_treinamento", treinamento)
        .order("name");
      const { data: activeClosers } = await q;

      if (!activeClosers?.length) return [];

      if (!dateStr) {
        return activeClosers.map((c: any) => {
          const ranges = c.business_hours_ranges && Array.isArray(c.business_hours_ranges) && c.business_hours_ranges.length > 0
            ? c.business_hours_ranges
            : [{ start: c.business_hours_start || "09:00", end: c.business_hours_end || "23:00" }];
          const totalSlots = businessSlots.length;
          return { id: c.id, name: c.name, freeSlots: totalSlots, totalSlots };
        });
      }

      // Fetch booked agendamentos (confirmed status, not deleted)
      const { data: agendamentos } = await supabase
        .from("agendamentos")
        .select("closer_id, scheduled_time")
        .eq("scheduled_date", dateStr)
        .is("deleted_at", null)
        .not("status", "in", '("cancelada","reagendada")');

      // Fetch closer blocks for the date (incluindo recorrentes do mesmo dia da semana)
      const dateObj = new Date(dateStr + "T12:00:00");
      const weekday = dateObj.getDay();
      const { data: rawBlocks } = await supabase
        .from("closer_blocks")
        .select("closer_id, start_time, end_time, is_recurring, recurrence_weekday, block_date")
        .or(`and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${weekday})`);
      const blockExceptions = await fetchBlockExceptions(dateStr);
      const blocks = applyBlockExceptions((rawBlocks ?? []) as any[], blockExceptions);

      // Count booked times per closer (unique hours)
      const bookedMap = new Map<string, Set<string>>();
      (agendamentos ?? []).forEach((a: any) => {
        const hourKey = a.scheduled_time.slice(0, 5);
        if (!bookedMap.has(a.closer_id)) bookedMap.set(a.closer_id, new Set());
        bookedMap.get(a.closer_id)!.add(hourKey);
      });

      // Count blocked hours per closer
      const blockedMap = new Map<string, Set<string>>();
      blocks.forEach((b: any) => {

        const startH = parseInt(b.start_time.slice(0, 2), 10);
        const endH = parseInt(b.end_time.slice(0, 2), 10);
        const endM = parseInt(b.end_time.slice(3, 5), 10) || 0;
        const endHourExclusive = endM > 0 ? endH + 1 : endH;
        if (!blockedMap.has(b.closer_id)) blockedMap.set(b.closer_id, new Set());
        for (let h = startH; h < endHourExclusive; h++) {
          blockedMap.get(b.closer_id)!.add(`${String(h).padStart(2, "0")}:00`);
        }
      });

      // Verifica horários passados de hoje, considerando o fuso de Brasília.
      const nowParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date());
      const get = (t: string) => nowParts.find((p) => p.type === t)?.value ?? "";
      const todayBR = `${get("year")}-${get("month")}-${get("day")}`;
      const isToday = dateStr === todayBR;
      const currentHourStr = isToday ? `${get("hour")}:${get("minute")}` : null;

      return activeClosers.map((c: any) => {
        // Slots do horário comercial configurado em Administração
        const allSlots = businessSlots;

        const booked = bookedMap.get(c.id) ?? new Set();
        const blocked = blockedMap.get(c.id) ?? new Set();

        let freeCount = 0;
        for (const slot of allSlots) {
          if (booked.has(slot)) continue;
          if (blocked.has(slot)) continue;
          if (currentHourStr && slot <= currentHourStr) continue;
          freeCount++;
        }

        return { id: c.id, name: c.name, freeSlots: freeCount, totalSlots: allSlots.length };
      });
    },
  });

  if (!closers.length) {
    return <p className="text-sm text-muted-foreground">Nenhum closer cadastrado.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {closers.map((closer) => {
        const isFull = closer.freeSlots <= 0;
        const isSelected = selectedCloserId === closer.id;

        return (
          <button
            key={closer.id}
            onClick={() => onSelect(closer.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all active:scale-[0.97]",
              isSelected
                ? "border-primary bg-primary/10"
                : "border-input bg-card hover:border-primary/40",
            )}
          >
            <span className="text-sm font-medium text-center leading-tight">{closer.name}</span>

            {selectedDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  isFull
                    ? "bg-[hsl(45_90%_40%)]/20 text-[hsl(45_90%_55%)]"
                    : "bg-primary/15 text-primary"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    isFull ? "bg-[hsl(45_90%_55%)]" : "bg-primary"
                  )}
                />
                {isFull ? "Cheio" : `${closer.freeSlots} livre${closer.freeSlots > 1 ? "s" : ""}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
