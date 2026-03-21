import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

interface TimeSlotPickerProps {
  closerId: string;
  date: Date;
  selectedTime: string | null;
  onSelect: (time: string) => void;
}

const ALL_SLOTS = [
  "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00",
];

export default function TimeSlotPicker({ closerId, date, selectedTime, onSelect }: TimeSlotPickerProps) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const { data: bookedTimes = [] } = useQuery<string[]>({
    queryKey: ["booked-slots", closerId, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("scheduled_time")
        .eq("closer_id", closerId)
        .eq("scheduled_date", dateStr)
        .in("status", ["pendente", "confirmada"]);
      return (data ?? []).map((a) => a.scheduled_time);
    },
  });

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return (
    <div className="grid grid-cols-4 gap-2">
      {ALL_SLOTS.map((slot) => {
        const isBooked = bookedTimes.includes(slot);
        const isPast = isToday && slot <= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const isDisabled = isBooked || isPast;
        const isSelected = selectedTime === slot;

        return (
          <button
            key={slot}
            disabled={isDisabled}
            onClick={() => onSelect(slot)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-all",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : isDisabled
                  ? "cursor-not-allowed border-input/50 bg-secondary/30 text-muted-foreground/40 line-through"
                  : "border-input bg-card hover:border-primary/50 active:scale-[0.97]"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {slot}
          </button>
        );
      })}
    </div>
  );
}
