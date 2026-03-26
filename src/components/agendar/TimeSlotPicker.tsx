import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Clock, Ban, AlertTriangle, PenLine } from "lucide-react";
import { useGoogleCalendarEvents } from "@/hooks/useGoogleCalendar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TimeSlotPickerProps {
  closerId: string;
  date: Date;
  selectedTime: string | null;
  onSelect: (time: string) => void;
}

interface TimeRange {
  start: string;
  end: string;
}

function generateSlotsFromRanges(ranges: TimeRange[]): string[] {
  const slots: string[] = [];
  for (const range of ranges) {
    const startH = parseInt(range.start.split(":")[0], 10);
    const endH = parseInt(range.end.split(":")[0], 10);
    for (let h = startH; h <= endH; h++) {
      const slot = `${String(h).padStart(2, "0")}:00`;
      if (!slots.includes(slot)) slots.push(slot);
    }
  }
  return slots.sort();
}

function parseBusinessHours(closerData: any): TimeRange[] {
  if (closerData?.business_hours_ranges && Array.isArray(closerData.business_hours_ranges) && closerData.business_hours_ranges.length > 0) {
    return closerData.business_hours_ranges as TimeRange[];
  }
  // Fallback to legacy start/end
  return [{
    start: closerData?.business_hours_start || "09:00",
    end: closerData?.business_hours_end || "23:00",
  }];
}

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

function isTimeInRanges(time: string, ranges: TimeRange[]): boolean {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const totalMin = h * 60 + m;

  return ranges.some((r) => {
    const sH = parseInt(r.start.split(":")[0], 10);
    const sM = parseInt(r.start.split(":")[1] || "0", 10);
    const eH = parseInt(r.end.split(":")[0], 10);
    const eM = parseInt(r.end.split(":")[1] || "0", 10);
    return totalMin >= sH * 60 + sM && totalMin <= eH * 60 + eM;
  });
}

function isCustomTimeValid(time: string, dateStr: string, isToday: boolean, now: Date, ranges: TimeRange[]): boolean {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  if (!isTimeInRanges(time, ranges)) return false;

  if (isToday) {
    const slotStart = new Date(`${dateStr}T${time}:00`);
    if (slotStart <= now) return false;
  }
  return true;
}

function isCustomTimeConflicting(
  time: string,
  dateStr: string,
  bookedTimes: string[],
  googleEvents: { start: string; end: string }[],
): boolean {
  const slotStart = new Date(`${dateStr}T${time}:00`);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

  const googleConflict = googleEvents.some((ev) => {
    const evStart = new Date(ev.start);
    const evEnd = new Date(ev.end);
    return evStart < slotEnd && evEnd > slotStart;
  });
  if (googleConflict) return true;

  const bookedConflict = bookedTimes.some((bt) => {
    const bookedStart = new Date(`${dateStr}T${bt}:00`);
    const bookedEnd = new Date(bookedStart.getTime() + 60 * 60 * 1000);
    return bookedStart < slotEnd && bookedEnd > slotStart;
  });

  return bookedConflict;
}

export default function TimeSlotPicker({ closerId, date, selectedTime, onSelect }: TimeSlotPickerProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // Fetch closer's individual business hours
  const { data: closerData } = useQuery({
    queryKey: ["closer-hours", closerId],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("business_hours_start, business_hours_end, business_hours_ranges").eq("id", closerId).single();
      return data;
    },
  });

  const ranges = useMemo(() => parseBusinessHours(closerData), [closerData]);
  const ALL_SLOTS = useMemo(() => generateSlotsFromRanges(ranges), [ranges]);

  const { data: bookedTimes = [] } = useQuery<string[]>({
    queryKey: ["booked-slots", closerId, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("scheduled_time")
        .eq("closer_id", closerId)
        .eq("scheduled_date", dateStr)
        .in("status", ["confirmada"]);
      return (data ?? []).map((a) => a.scheduled_time);
    },
  });

  // Closer personal blocks
  const { data: closerBlocks = [] } = useQuery({
    queryKey: ["closer-blocks-slots", closerId, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("closer_blocks")
        .select("start_time, end_time, block_type")
        .eq("closer_id", closerId)
        .eq("block_date", dateStr);
      return data ?? [];
    },
  });

  function isSlotBlockedByPersonal(slot: string): boolean {
    const slotH = parseInt(slot.slice(0, 2), 10);
    return closerBlocks.some((b: any) => {
      const startH = parseInt(b.start_time.slice(0, 2), 10);
      const endH = parseInt(b.end_time.slice(0, 2), 10);
      return slotH >= startH && slotH <= endH;
    });
  }

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

  const isCustomSelected = selectedTime !== null && !ALL_SLOTS.includes(selectedTime);

  const handleCustomConfirm = () => {
    setCustomError(null);

    if (!isCustomTimeValid(customInput, dateStr, isToday, now, ranges)) {
      setCustomError("Horário inválido ou fora do expediente do closer.");
      return;
    }

    if (isCustomTimeConflicting(customInput, dateStr, bookedTimes, googleEvents)) {
      setCustomError("Esse horário conflita com outro agendamento ou evento.");
      return;
    }

    onSelect(customInput);
    setCustomMode(false);
  };

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
          const isPersonalBlock = isSlotBlockedByPersonal(slot);
          const isPast = isToday && slot <= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const isDisabled = isBooked || isGoogleBlocked || isPersonalBlock || isPast;
          const isSelected = selectedTime === slot;

          return (
            <button
              key={slot}
              disabled={isDisabled}
              onClick={() => {
                onSelect(slot);
                setCustomMode(false);
                setCustomError(null);
              }}
              title={isPersonalBlock ? "Compromisso pessoal" : isGoogleBlocked ? "Indisponível (Google Calendar)" : isBooked ? "Já agendado" : undefined}
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

        {/* Custom time toggle button */}
        <button
          onClick={() => {
            setCustomMode(!customMode);
            setCustomError(null);
            if (!customMode) setCustomInput("");
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-all",
            customMode || isCustomSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-dashed border-input bg-card hover:border-primary/50 active:scale-[0.97]"
          )}
        >
          <PenLine className="h-3.5 w-3.5" />
          {isCustomSelected && !customMode ? selectedTime : "Outro"}
        </button>
      </div>

      {/* Custom time input */}
      {customMode && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Horário personalizado (ex: 16:20)
            </label>
            <Input
              type="time"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setCustomError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomConfirm();
              }}
              placeholder="HH:MM"
              className="h-9 w-32 font-mono"
              autoFocus
            />
            {customError && (
              <p className="text-xs text-destructive">{customError}</p>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleCustomConfirm}
            disabled={!customInput}
            className="mt-5"
          >
            Confirmar
          </Button>
        </div>
      )}
    </div>
  );
}

export { parseBusinessHours };
export type { TimeRange };
