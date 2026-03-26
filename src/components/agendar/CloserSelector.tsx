import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface CloserSelectorProps {
  selectedDate: Date | undefined;
  selectedCloserId: string | null;
  onSelect: (closerId: string) => void;
}

interface CloserWithAvailability {
  id: string;
  name: string;
  freeSlots: number;
  totalSlots: number;
}

function countSlotsFromRanges(ranges: { start: string; end: string }[]): number {
  const slots = new Set<string>();
  for (const r of ranges) {
    const sH = parseInt(r.start.split(":")[0], 10);
    const eH = parseInt(r.end.split(":")[0], 10);
    for (let h = sH; h <= eH; h++) {
      slots.add(`${String(h).padStart(2, "0")}:00`);
    }
  }
  return slots.size;
}

export default function CloserSelector({ selectedDate, selectedCloserId, onSelect }: CloserSelectorProps) {
  const dateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: closers = [] } = useQuery<CloserWithAvailability[]>({
    queryKey: ["closers-availability", dateStr],
    queryFn: async () => {
      const { data: activeClosers } = await supabase
        .from("closers")
        .select("id, name, business_hours_start, business_hours_end, business_hours_ranges")
        .eq("active", true)
        .order("name");

      if (!activeClosers?.length) return [];

      if (!dateStr) {
        return activeClosers.map((c: any) => {
          const ranges = c.business_hours_ranges && Array.isArray(c.business_hours_ranges) && c.business_hours_ranges.length > 0
            ? c.business_hours_ranges
            : [{ start: c.business_hours_start || "09:00", end: c.business_hours_end || "23:00" }];
          const totalSlots = countSlotsFromRanges(ranges);
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

      // Fetch closer blocks for the date
      const { data: blocks } = await supabase
        .from("closer_blocks")
        .select("closer_id, start_time, end_time")
        .eq("block_date", dateStr);

      // Count booked times per closer (unique hours)
      const bookedMap = new Map<string, Set<string>>();
      (agendamentos ?? []).forEach((a: any) => {
        const hourKey = a.scheduled_time.slice(0, 5);
        if (!bookedMap.has(a.closer_id)) bookedMap.set(a.closer_id, new Set());
        bookedMap.get(a.closer_id)!.add(hourKey);
      });

      // Count blocked hours per closer
      const blockedMap = new Map<string, Set<string>>();
      (blocks ?? []).forEach((b: any) => {
        const startH = parseInt(b.start_time.slice(0, 2), 10);
        const endH = parseInt(b.end_time.slice(0, 2), 10);
        if (!blockedMap.has(b.closer_id)) blockedMap.set(b.closer_id, new Set());
        for (let h = startH; h < endH; h++) {
          blockedMap.get(b.closer_id)!.add(`${String(h).padStart(2, "0")}:00`);
        }
      });

      // Check past hours for today
      const now = new Date();
      const isToday = dateStr === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const currentHourStr = isToday ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : null;

      return activeClosers.map((c: any) => {
        const ranges = c.business_hours_ranges && Array.isArray(c.business_hours_ranges) && c.business_hours_ranges.length > 0
          ? c.business_hours_ranges
          : [{ start: c.business_hours_start || "09:00", end: c.business_hours_end || "23:00" }];
        
        // Generate all slots
        const allSlots: string[] = [];
        for (const r of ranges) {
          const sH = parseInt(r.start.split(":")[0], 10);
          const eH = parseInt(r.end.split(":")[0], 10);
          for (let h = sH; h <= eH; h++) {
            const s = `${String(h).padStart(2, "0")}:00`;
            if (!allSlots.includes(s)) allSlots.push(s);
          }
        }

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
