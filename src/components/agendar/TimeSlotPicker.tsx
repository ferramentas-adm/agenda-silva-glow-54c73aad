import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, PenLine, CalendarDays, Lock } from "lucide-react";
import { useGoogleCalendarEvents } from "@/hooks/useGoogleCalendar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSlotCounts } from "@/hooks/useSlotCounts";
import { useSlotLimit } from "@/hooks/useSlotLimit";
import { useBusinessHours } from "@/hooks/useBusinessHours";
import { applyBlockExceptions, fetchBlockExceptions } from "@/lib/closerBlockExceptions";

import { Users } from "lucide-react";

interface TimeSlotPickerProps {
  closerId: string | null;
  date: Date;
  selectedTime: string | null;
  onSelect: (time: string, durationMinutes?: number) => void;
  /** Se true, calcula lotação apenas com closers em treinamento. */
  treinamento?: boolean;
}

function timeToMin(t: string): number | null {
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

interface TimeRange {
  start: string;
  end: string;
}

// Slots fixos: 09h às 23h (1 em 1 hora). O botão "Outro" permite personalizar.
const FIXED_SLOTS: string[] = (() => {
  const arr: string[] = [];
  for (let h = 9; h <= 23; h++) arr.push(`${String(h).padStart(2, "0")}:00`);
  return arr;
})();

function generateSlotsFromRanges(_ranges: TimeRange[]): string[] {
  // Mantido por compatibilidade externa, mas internamente usamos FIXED_SLOTS.
  return FIXED_SLOTS;
}

function parseBusinessHours(closerData: any): TimeRange[] {
  if (closerData?.business_hours_ranges && Array.isArray(closerData.business_hours_ranges) && closerData.business_hours_ranges.length > 0) {
    return closerData.business_hours_ranges as TimeRange[];
  }
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

function isCustomTimeValid(time: string, dateStr: string, isToday: boolean, now: Date, _ranges: TimeRange[]): boolean {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  // Permite qualquer horário válido — não restringe ao expediente do closer.

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

export default function TimeSlotPicker({ closerId, date, selectedTime, onSelect, treinamento = false }: TimeSlotPickerProps) {
  const { role } = useAuth();
  const canForceFullSlot = role === "gestor" || (role === "moderador" || role === "apresentador") || role === "supervisor";
  const isSdr = role === "sdr";
  const isCloser = role === "closer";
  // Regra: SDR/Closer só são impedidos quando o slot está de fato lotado
  // (todos os closers ativos ocupados/bloqueados). Enquanto houver capacidade
  // no horário, novos agendamentos são permitidos.
  const blockIfAnyBooking = false;
  const [customMode, setCustomMode] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  // Pop-up apenas informativo: nenhum usuário pode forçar agendamento em bloqueio pessoal.
  const [blockedInfo, setBlockedInfo] = useState<string | null>(null);
  // Pop-up de slot lotado (SDR) ou confirmação para forçar (gestor/moderador).
  const [fullSlotInfo, setFullSlotInfo] = useState<{ time: string; count: number; duration?: number } | null>(null);

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const globalMode = !closerId;

  // Fetch closer's individual business hours
  const { data: closerData } = useQuery({
    queryKey: ["closer-hours", closerId],
    enabled: !!closerId,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("business_hours_start, business_hours_end, business_hours_ranges").eq("id", closerId!).maybeSingle();
      return data;
    },
  });

  // Slots fixos: 09h às 23h (independente do horário do closer).
  const ranges = useMemo(() => parseBusinessHours(closerData), [closerData]);
  // Slots refletem o horário comercial global (Administração > Configurações Gerais).
  const { slots: ALL_SLOTS } = useBusinessHours();

  const { data: bookedTimes = [] } = useQuery<string[]>({
    queryKey: ["booked-slots", closerId, dateStr],
    enabled: !!closerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("scheduled_time")
        .eq("closer_id", closerId!)
        .eq("scheduled_date", dateStr)
        .is("deleted_at", null)
        .in("status", ["agendada", "confirmada"]);
      return (data ?? []).map((a) => a.scheduled_time);
    },
  });

  // Closer personal blocks (data específica + recorrentes do mesmo dia da semana)
  const weekday = date.getDay();
  const { data: closerBlocks = [] } = useQuery({
    queryKey: ["closer-blocks-slots", closerId, dateStr, weekday],
    enabled: !!closerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("closer_blocks")
        .select("start_time, end_time, block_type, is_recurring, recurrence_weekday, block_date, closer_id")
        .eq("closer_id", closerId!)
        .or(`and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${weekday})`);
      const exceptions = await fetchBlockExceptions(dateStr, [closerId!]);
      return applyBlockExceptions((data ?? []) as any[], exceptions);
    },
  });


  function isSlotBlockedByPersonal(slot: string): boolean {
    if (globalMode) return false;
    const slotH = parseInt(slot.slice(0, 2), 10);
    return closerBlocks.some((b: any) => {
      const startH = parseInt(b.start_time.slice(0, 2), 10);
      const endH = parseInt(b.end_time.slice(0, 2), 10);
      const endM = parseInt(b.end_time.slice(3, 5), 10) || 0;
      const endHourExclusive = endM > 0 ? endH + 1 : endH;
      return slotH >= startH && slotH < endHourExclusive;
    });
  }

  // Google Calendar events (apenas em modo por closer)
  const dateStart = `${dateStr}T00:00:00`;
  const dateEnd = `${dateStr}T23:59:59`;
  const { data: calendarData } = useGoogleCalendarEvents(closerId, dateStart, dateEnd);

  const googleEvents = globalMode ? [] : (calendarData?.events ?? []);
  const calendarExpired = !globalMode && (calendarData?.expired ?? false);
  const calendarConnected = !globalMode && (calendarData?.connected ?? false);

  // Lotação dinâmica: capacidade = closers ativos disponíveis no slot.
  const { data: slotCounts } = useSlotCounts(dateStr, treinamento);
  const { limit: slotLimit } = useSlotLimit();
  const infoFor = (slot: string) => slotCounts?.get(slot) ?? { count: 0, capacity: 0, full: false };
  const countFor = (slot: string) => infoFor(slot).count;
  const capacityFor = (slot: string) => infoFor(slot).capacity;
  const isSlotFull = (slot: string) => infoFor(slot).full;

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

    const startMin = timeToMin(customStart);
    const endMin = timeToMin(customEnd);
    if (startMin === null || endMin === null) {
      setCustomError("Informe horário inicial e final válidos (HH:MM).");
      return;
    }
    if (endMin <= startMin) {
      setCustomError("O horário final deve ser maior que o inicial.");
      return;
    }
    if (!isCustomTimeValid(customStart, dateStr, isToday, now, ranges)) {
      setCustomError("Horário inicial inválido ou já passou.");
      return;
    }

    // Check personal blocks — bloqueio absoluto para TODOS (incl. gestor/moderador).
    // Verifica qualquer sobreposição entre [startMin, endMin) e os bloqueios.
    const isBlockedByPersonal = closerBlocks.some((b: any) => {
      const bStart = parseInt(b.start_time.slice(0, 2), 10) * 60 + parseInt(b.start_time.slice(3, 5) || "0", 10);
      const bEnd = parseInt(b.end_time.slice(0, 2), 10) * 60 + parseInt(b.end_time.slice(3, 5) || "0", 10);
      return startMin < bEnd && endMin > bStart;
    });
    if (isBlockedByPersonal) {
      setBlockedInfo("Este horário está bloqueado por compromisso pessoal do closer e não pode ser usado para agendamentos.");
      return;
    }

    // SDR: bloqueia se este closer já tem reunião no horário escolhido
    if (isSdr) {
      const conflict = bookedTimes.some((bt) => {
        const bStart = timeToMin(bt.slice(0, 5));
        if (bStart === null) return false;
        const bEnd = bStart + 60;
        return startMin < bEnd && endMin > bStart;
      });
      if (conflict) {
        setCustomError("Este closer já tem uma reunião marcada neste horário.");
        return;
      }
    }


    // SDR/Closer: bloqueia se já existe QUALQUER agenda nesse horário (globalmente)
    const startSlot = customStart.slice(0, 5);
    const info = infoFor(startSlot);
    if (blockIfAnyBooking && info.count >= 1) {
      setCustomError(`Já existe agenda neste horário (${info.count}). Escolha outro horário.`);
      return;
    }

    // Slot lotado globalmente (todos closers ativos ocupados/bloqueados nesse horário)
    if (info.full) {
      if (canForceFullSlot) {
        setFullSlotInfo({ time: startSlot, count: info.count, duration: endMin - startMin });
        return;
      }
      setCustomError(`Horário lotado (${info.count}/${info.capacity}).`);
      return;
    }

    const duration = endMin - startMin;
    onSelect(customStart, duration);
    setCustomMode(false);
  };

  // Resumo de slots lotados / quase lotados (para faixa de aviso no topo)
  const { fullSlots, nearlyFullSlots } = useMemo(() => {
    const full: { time: string; count: number }[] = [];
    const nearly: { time: string; count: number }[] = [];
    for (const slot of ALL_SLOTS) {
      if (isToday && slot <= spNow.timeStr) continue; // ignora passados
      const info = slotCounts?.get(slot) ?? { count: 0, capacity: 0, full: false };
      if (info.full) full.push({ time: slot, count: info.count });
      else if (info.capacity > 0 && info.count >= Math.max(1, info.capacity - 2)) {
        nearly.push({ time: slot, count: info.count });
      }
    }
    return { fullSlots: full, nearlyFullSlots: nearly };
  }, [ALL_SLOTS, slotCounts, isToday, spNow.timeStr]);

  return (
    <div className="space-y-3">
      {calendarExpired && calendarConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Agenda do Google temporariamente indisponível. Mostrando apenas slots do painel.
        </div>
      )}

      {/* Faixa de aviso: horários lotados / quase lotados */}
      {role !== "closer" && (fullSlots.length > 0 || nearlyFullSlots.length > 0) && (
        <div className="space-y-2">
          {fullSlots.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-red-500/60 bg-red-500/15 px-3 py-2.5 text-sm">
              <Users className="h-4 w-4 shrink-0 text-red-500" />
              <span className="font-semibold text-red-600 dark:text-red-400">
                Não ofereça ao lead — lotado:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {fullSlots.map((s) => (
                  <span
                    key={s.time}
                    className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white"
                  >
                    {s.time}
                  </span>
                ))}
              </div>
            </div>
          )}
          {nearlyFullSlots.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Quase lotado — evite oferecer:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {nearlyFullSlots.map((s) => (
                  <span
                    key={s.time}
                    className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white"
                  >
                    {s.time}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Disponível</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Agendado (interno)</span>
        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 text-blue-500" /> Google Calendar</span>
        <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-rose-400" /> Bloqueio pessoal</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3 text-red-500" /> Lotado (todos os closers ocupados)</span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {ALL_SLOTS.map((slot) => {
          const isBooked = bookedTimes.includes(slot);
          const isGoogleBlocked = isSlotBlockedByGoogle(slot, googleEvents, dateStr);
          const isPersonalBlock = isSlotBlockedByPersonal(slot);
          const isPast = isToday && slot <= spNow.timeStr;
          const isSelected = selectedTime === slot;
          const slotInfo = infoFor(slot);
          const slotCount = slotInfo.count;
          const slotCapacity = slotInfo.capacity;
          const isFull = slotInfo.full;
          const isNearlyFull = !isFull && slotCapacity > 0 && slotCount >= Math.max(1, slotCapacity - 2);
          // SDR/Closer não podem empilhar: qualquer agenda no slot bloqueia.
          const isBlockedByAnyBooking = blockIfAnyBooking && slotCount >= 1 && !isFull;

          // Priority: personal block > FULL > blocked-any-booking (SDR/Closer) > google > internal booking
          let slotStyle = "border-input bg-card hover:border-primary/50 active:scale-[0.97]";
          let SlotIcon: any = Clock;
          let iconClass = "h-3.5 w-3.5";
          let title: string | undefined;

          if (isPersonalBlock) {
            slotStyle = "border-rose-400/50 bg-rose-500/10 cursor-not-allowed opacity-60";
            SlotIcon = Lock;
            iconClass = "h-3.5 w-3.5 text-rose-400";
            title = "Bloqueio pessoal — não disponível";
          } else if (isFull) {
            slotStyle = canForceFullSlot
              ? "border-red-500/60 bg-red-500/15 hover:border-red-500 active:scale-[0.97]"
              : "border-red-500/60 bg-red-500/15 cursor-not-allowed opacity-80";
            SlotIcon = Users;
            iconClass = "h-3.5 w-3.5 text-red-500";
            title = canForceFullSlot
              ? `Lotado (${slotCount}/${slotCapacity}) — clique para forçar`
              : `Lotado (${slotCount}/${slotCapacity}) — todos os closers ocupados`;
          } else if (isBlockedByAnyBooking) {
            slotStyle = "border-amber-500/60 bg-amber-500/15 cursor-not-allowed opacity-70";
            SlotIcon = AlertTriangle;
            iconClass = "h-3.5 w-3.5 text-amber-500";
            title = `Já existe agenda neste horário (${slotCount}). Não é permitido empilhar.`;
          } else if (isGoogleBlocked) {
            slotStyle = "border-blue-400/50 bg-blue-500/10 hover:border-primary/50 active:scale-[0.97]";
            SlotIcon = CalendarDays;
            iconClass = "h-3.5 w-3.5 text-blue-500";
            title = "Ocupado no Google Calendar (permite agendar)";
          } else if (isBooked) {
            slotStyle = isSdr
              ? "border-amber-500/50 bg-amber-500/10 cursor-not-allowed opacity-70"
              : "border-amber-500/50 bg-amber-500/10 hover:border-primary/50 active:scale-[0.97]";
            SlotIcon = AlertTriangle;
            iconClass = "h-3.5 w-3.5 text-amber-500";
            title = isSdr
              ? "Este closer já tem reunião neste horário"
              : "Já agendado internamente (permite novo)";
          }

          return (
            <button
              key={slot}
              disabled={isPast}
              onClick={() => {
                if (isPersonalBlock) {
                  setBlockedInfo("Este horário está bloqueado por compromisso pessoal do closer e não pode ser usado para agendamentos.");
                  return;
                }
                if (isBlockedByAnyBooking) {
                  setBlockedInfo(`Já existe uma agenda neste horário (${slotCount}). SDRs e Closers não podem marcar duas reuniões no mesmo horário — escolha outro.`);
                  return;
                }
                if (isSdr && isBooked) {
                  setBlockedInfo("Este closer já tem uma reunião marcada neste horário. Escolha outro horário ou outro closer.");
                  return;
                }
                if (isFull) {
                  setFullSlotInfo({ time: slot, count: slotCount });
                  return;
                }
                onSelect(slot);
                setCustomMode(false);
                setCustomError(null);
              }}
              title={title}
              className={cn(
                "relative flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-all",
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
              {!isPast && !isSelected && (isFull || isNearlyFull) && (
                <span
                  className={cn(
                    "absolute -top-1.5 -right-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm",
                    isFull ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                  )}
                >
                  {slotCount}/{slotCapacity}
                </span>
              )}
            </button>
          );
        })}

        {/* Custom time toggle button */}
        <button
          onClick={() => {
            setCustomMode(!customMode);
            setCustomError(null);
            if (!customMode) {
              setCustomStart("");
              setCustomEnd("");
            }
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

      <AlertDialog open={!!blockedInfo} onOpenChange={(open) => !open && setBlockedInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-rose-400" />
              Horário bloqueado
            </AlertDialogTitle>
            <AlertDialogDescription>{blockedInfo}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedInfo(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!fullSlotInfo} onOpenChange={(open) => !open && setFullSlotInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-red-500" />
              Horário lotado
            </AlertDialogTitle>
            <AlertDialogDescription>
              {fullSlotInfo && (
                <>
                  O horário <strong>{fullSlotInfo.time}</strong> já tem <strong>{fullSlotInfo.count}</strong> agendas
                  marcadas e todos os closers ativos disponíveis ({capacityFor(fullSlotInfo.time)}) já estão ocupados nesse horário.
                  {canForceFullSlot
                    ? " Você pode forçar o agendamento, mas confirme se realmente é necessário."
                    : " Por favor, escolha outro horário."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {canForceFullSlot ? (
              <>
                <AlertDialogCancel onClick={() => setFullSlotInfo(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (fullSlotInfo) {
                      onSelect(fullSlotInfo.time, fullSlotInfo.duration);
                      setCustomMode(false);
                      setCustomError(null);
                    }
                    setFullSlotInfo(null);
                  }}
                >
                  Forçar mesmo assim
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => setFullSlotInfo(null)}>Entendi</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom time input */}
      {customMode && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Horário inicial
            </label>
            <Input
              type="time"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setCustomError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomConfirm();
              }}
              placeholder="HH:MM"
              className="h-9 w-32 font-mono"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Horário final
            </label>
            <Input
              type="time"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setCustomError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomConfirm();
              }}
              placeholder="HH:MM"
              className="h-9 w-32 font-mono"
            />
          </div>
          <Button
            size="sm"
            onClick={handleCustomConfirm}
            disabled={!customStart || !customEnd}
          >
            Confirmar
          </Button>
          {customError && (
            <p className="w-full text-xs text-destructive">{customError}</p>
          )}
        </div>
      )}
    </div>
  );
}

export { parseBusinessHours };
export type { TimeRange };
