import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, PenLine, CalendarDays, Lock } from "lucide-react";
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
  _bookedTimes: string[],
  googleEvents: { start: string; end: string }[],
): boolean {
  const slotStart = new Date(`${dateStr}T${time}:00`);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

  const googleConflict = googleEvents.some((ev) => {
    const evStart = new Date(ev.start);
    const evEnd = new Date(ev.end);
    return evStart < slotEnd && evEnd > slotStart;
  });
  return googleConflict;
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
      return slotH >= startH && slotH < endH;
    });
  }

  // Google Calendar events
  const dateStart = `${dateStr}T00:00:00`;
  const dateEnd = `${dateStr}T23:59:59`;
  const { data: calendarData } = useGoogleCalendarEvents(closerId, dateStart, dateEnd);

  const googleEvents = calendarData?.events ?? [];
  const calendarExpired = calendarData?.expired ?? false;
  const calendarConnected = calendarData?.connected ?? false;

  // Use São Paulo timezone for "today" checks
  const spNow = useMemo(() => {
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = spFormatter.formatToParts(now);
    return {
      date: `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`,
      hour: parseInt(parts.find(p => p.type === "hour")!.value, 10),
      minute: parseInt(parts.find(p => p.type === "minute")!.value, 10),
      timeStr: `${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`,
    };
  }, []);

  const isToday = dateStr === spNow.date;
  const now = new Date();

  const isCustomSelected = selectedTime !== null && !ALL_SLOTS.includes(selectedTime);

  const handleCustomConfirm = () => {
    setCustomError(null);

    if (!isCustomTimeValid(customInput, dateStr, isToday, now, ranges)) {
      setCustomError("Horário inválido ou fora do expediente do closer.");
      return;
    }

    // Permite agendar mesmo com conflitos (interno ou Google Calendar)

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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Disponível</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Agendado (interno)</span>
        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 text-blue-500" /> Google Calendar</span>
        <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-rose-400" /> Bloqueio pessoal</span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {ALL_SLOTS.map((slot) => {
          const isBooked = bookedTimes.includes(slot);
          const isGoogleBlocked = isSlotBlockedByGoogle(slot, googleEvents, dateStr);
          const isPersonalBlock = isSlotBlockedByPersonal(slot);
          const isPast = isToday && slot <= spNow.timeStr;
          const isSelected = selectedTime === slot;

          // Priority: personal block > google > internal booking
          let slotStyle = "border-input bg-card hover:border-primary/50 active:scale-[0.97]";
          let SlotIcon = Clock;
          let iconClass = "h-3.5 w-3.5";
          let title: string | undefined;

          if (isPersonalBlock) {
            slotStyle = "border-rose-400/50 bg-rose-500/10 hover:border-primary/50 active:scale-[0.97]";
            SlotIcon = Lock;
            iconClass = "h-3.5 w-3.5 text-rose-400";
            title = "Bloqueio pessoal (permite agendar)";
          } else if (isGoogleBlocked) {
            slotStyle = "border-blue-400/50 bg-blue-500/10 hover:border-primary/50 active:scale-[0.97]";
            SlotIcon = CalendarDays;
            iconClass = "h-3.5 w-3.5 text-blue-500";
            title = "Ocupado no Google Calendar (permite agendar)";
          } else if (isBooked) {
            slotStyle = "border-amber-500/50 bg-amber-500/10 hover:border-primary/50 active:scale-[0.97]";
            SlotIcon = AlertTriangle;
            iconClass = "h-3.5 w-3.5 text-amber-500";
            title = "Já agendado internamente (permite novo)";
          }

          return (
            <button
              key={slot}
              disabled={isPast}
              onClick={() => {
                onSelect(slot);
                setCustomMode(false);
                setCustomError(null);
              }}
              title={title}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : isPast
                    ? "cursor-not-allowed border-input/50 bg-secondary/30 text-muted-foreground/40 line-through"
                    : slotStyle
              )}
            >
              {isPast ? (
                <Clock className="h-3.5 w-3.5" />
              ) : isSelected ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <SlotIcon className={iconClass} />
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
