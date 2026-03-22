import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Clock, Ban, AlertTriangle } from "lucide-react";
import { useGoogleCalendarEvents } from "@/hooks/useGoogleCalendar";

interface TimeSlotPickerProps {
  closerId: string;
  date: Date;
  selectedTime: string | null;
  onSelect: (time: string) => void;
}

const ALL_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00",
  "19:00", "20:00", "21:00", "22:00", "23:00",
];

function isSlotBlockedByGoogle(
  slot: string,
  events: { start: string; end: string }[],
  dateStr: string,
): boolean {
  const slotStart = new Date(`${dateStr}T${slot}:00`);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

  return events.some((ev) => {
    const evStart = new Date(ev.start);
    const evEnd = new Date(ev.end);
    return evStart < slotEnd && evEnd > slotStart;
  });
}

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

  // Google Calendar events
  const dateStart = `${dateStr}T00:00:00`;
  const dateEnd = `${dateStr}T23:59:59`;
  const { data: calendarData } = useGoogleCalendarEvents(closerId, dateStart, dateEnd);

  const googleEvents = calendarData?.events ?? [];
  const calendarExpired = calendarData?.expired ?? false;
  const calendarConnected = calendarData?.connected ?? false;

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return (
    <div className="space-y-3">
      {calendarExpired && calendarConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Agenda do Google temporariamente indisponível. Mostrando apenas slots do painel.
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {ALL_SLOTS.map((slot) => {
          const isBooked = bookedTimes.includes(slot);
          const isGoogleBlocked = isSlotBlockedByGoogle(slot, googleEvents, dateStr);
          const isPast = isToday && slot <= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const isDisabled = isBooked || isGoogleBlocked || isPast;
          const isSelected = selectedTime === slot;

          return (
            <button
              key={slot}
              disabled={isDisabled}
              onClick={() => onSelect(slot)}
              title={isGoogleBlocked ? "Indisponível (Google Calendar)" : isBooked ? "Já agendado" : undefined}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : isGoogleBlocked
                    ? "cursor-not-allowed border-muted bg-muted/50 text-muted-foreground/60"
                    : isDisabled
                      ? "cursor-not-allowed border-input/50 bg-secondary/30 text-muted-foreground/40 line-through"
                      : "border-input bg-card hover:border-primary/50 active:scale-[0.97]"
              )}
            >
              {isGoogleBlocked ? (
                <Ban className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}
