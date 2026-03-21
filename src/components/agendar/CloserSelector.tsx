import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

interface CloserSelectorProps {
  selectedDate: Date | undefined;
  selectedCloserId: string | null;
  onSelect: (closerId: string) => void;
}

interface CloserWithAvailability {
  id: string;
  name: string;
  bookedSlots: number;
}

const MAX_SLOTS_PER_DAY = 8; // 8h-16h, 60min slots

export default function CloserSelector({ selectedDate, selectedCloserId, onSelect }: CloserSelectorProps) {
  const dateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : null;

  const { data: closers = [] } = useQuery<CloserWithAvailability[]>({
    queryKey: ["closers-availability", dateStr],
    queryFn: async () => {
      const { data: activeClosers } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name");

      if (!activeClosers?.length) return [];

      if (!dateStr) {
        return activeClosers.map((c) => ({ ...c, bookedSlots: 0 }));
      }

      const { data: agendamentos } = await supabase
        .from("agendamentos")
        .select("closer_id")
        .eq("scheduled_date", dateStr)
        .in("status", ["pendente", "confirmada"]);

      const countMap = new Map<string, number>();
      (agendamentos ?? []).forEach((a) => {
        countMap.set(a.closer_id, (countMap.get(a.closer_id) ?? 0) + 1);
      });

      return activeClosers.map((c) => ({
        ...c,
        bookedSlots: countMap.get(c.id) ?? 0,
      }));
    },
  });

  if (!closers.length) {
    return <p className="text-sm text-muted-foreground">Nenhum closer cadastrado.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {closers.map((closer) => {
        const isFull = closer.bookedSlots >= MAX_SLOTS_PER_DAY;
        const isSelected = selectedCloserId === closer.id;
        const freeSlots = MAX_SLOTS_PER_DAY - closer.bookedSlots;

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
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground"
              )}
            >
              {closer.name.charAt(0).toUpperCase()}
            </div>
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
                {isFull ? "Cheio" : `${freeSlots} livre${freeSlots > 1 ? "s" : ""}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
