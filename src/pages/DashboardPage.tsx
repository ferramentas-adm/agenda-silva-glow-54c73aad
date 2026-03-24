import { useState, useMemo, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startOfWeek, endOfWeek, addWeeks, format, isSameDay, addDays, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PlusCircle, CalendarOff, ChevronLeft, ChevronRight, Video, Clock,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import { useCloserFilter } from "@/hooks/useCloserFilter";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type ViewMode = "week" | "day";

interface Agendamento {
  id: string;
  lead_name: string;
  lead_phone: string;
  closer_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  meet_link: string | null;
  observation: string | null;
}

// ─── Status helpers ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  confirmada: "bg-primary/20 text-primary border-primary/30",
  realizada: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cancelada: "bg-destructive/20 text-destructive border-destructive/30",
  reagendada: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  reagendada: "Reagendada",
};

// ─── Main Page ───────────────────────────────────────────────────

export default function DashboardPage() {
  const { closers, selectedIds, toggle, isLoading } = useCloserFilter();
  const { pendingCount, syncing, syncNow } = useDataCrazySync();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  // Week range
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const dateRangeStr = viewMode === "week"
    ? `${format(weekStart, "yyyy-MM-dd")}|${format(weekEnd, "yyyy-MM-dd")}`
    : format(currentDate, "yyyy-MM-dd");

  // Fetch agendamentos
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useQuery<Agendamento[]>({
    queryKey: ["agendamentos", dateRangeStr, viewMode],
    queryFn: async () => {
      let query = supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, closer_id, scheduled_date, scheduled_time, status, meet_link, observation")
        .order("scheduled_time", { ascending: true });

      if (viewMode === "week") {
        query = query
          .gte("scheduled_date", format(weekStart, "yyyy-MM-dd"))
          .lte("scheduled_date", format(weekEnd, "yyyy-MM-dd"));
      } else {
        query = query.eq("scheduled_date", format(currentDate, "yyyy-MM-dd"));
      }

      const { data } = await query;
      return (data ?? []) as Agendamento[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("agendamentos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Filter by selected closers
  const filtered = useMemo(
    () => agendamentos.filter((a) => selectedIds.has(a.closer_id)),
    [agendamentos, selectedIds]
  );

  // Navigation
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () =>
    setCurrentDate((d) => (viewMode === "week" ? addWeeks(d, -1) : addDays(d, -1)));
  const goNext = () =>
    setCurrentDate((d) => (viewMode === "week" ? addWeeks(d, 1) : addDays(d, 1)));

  const closerMap = useMemo(() => {
    const m = new Map<string, string>();
    closers.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [closers]);

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4">
        <DataCrazySyncIndicator pendingCount={pendingCount} syncing={syncing} onSyncNow={syncNow} />

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-sm text-muted-foreground">
              {viewMode === "week"
                ? `${format(weekStart, "dd MMM", { locale: ptBR })} — ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`
                : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
          <Link to="/agendar">
            <Button size="sm" className="gap-2">
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Agendar</span>
            </Button>
          </Link>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "day"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Dia
            </button>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToday}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Closer filter */}
        {isLoading ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <CloserFilterBar closers={closers} selectedIds={selectedIds} onToggle={toggle} />
          </div>
        )}

        {/* Content */}
        {isLoading || loadingAgendamentos ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : viewMode === "week" ? (
          <WeekView
            days={weekDays}
            agendamentos={filtered}
            closerMap={closerMap}
          />
        ) : (
          <DayView
            date={currentDate}
            closers={closers.filter((c) => selectedIds.has(c.id))}
            agendamentos={filtered}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ─── Week View ───────────────────────────────────────────────────

function WeekView({
  days,
  agendamentos,
  closerMap,
}: {
  days: Date[];
  agendamentos: Agendamento[];
  closerMap: Map<string, string>;
}) {
  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    agendamentos.forEach((a) => {
      const list = map.get(a.scheduled_date) || [];
      list.push(a);
      map.set(a.scheduled_date, list);
    });
    return map;
  }, [agendamentos]);

  const hasAny = agendamentos.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-dashed border-primary/20 bg-card flex flex-col items-center justify-center py-16 text-center">
        <CalendarOff className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground font-medium">Sem reuniões nesta semana</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Crie um novo agendamento para começar.
        </p>
        <Link to="/agendar" className="mt-4">
          <Button size="sm" className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Agendar lead
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayAgendamentos = byDate.get(dateStr) || [];
        const today = isToday(day);
        const weekend = day.getDay() === 0 || day.getDay() === 6;

        return (
          <div
            key={dateStr}
            className={cn(
              "rounded-xl border bg-card p-3 space-y-2 min-h-[120px]",
              today ? "border-primary/40" : "border-primary/10",
              weekend && "opacity-60"
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-xs font-semibold uppercase",
                  today ? "text-primary" : "text-muted-foreground"
                )}
              >
                {format(day, "EEE", { locale: ptBR })}
              </span>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                  today
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                )}
              >
                {format(day, "dd")}
              </span>
            </div>

            {dayAgendamentos.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 text-center pt-4">—</p>
            ) : (
              <div className="space-y-1.5">
                {dayAgendamentos.map((ag) => (
                  <AgendamentoCard
                    key={ag.id}
                    ag={ag}
                    closerName={closerMap.get(ag.closer_id) || ""}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Day View ────────────────────────────────────────────────────

const DAY_HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

function DayView({
  date,
  closers,
  agendamentos,
}: {
  date: Date;
  closers: { id: string; name: string }[];
  agendamentos: Agendamento[];
}) {
  // Index agendamentos by closer+hour
  const slotMap = useMemo(() => {
    const m = new Map<string, Agendamento>();
    agendamentos.forEach((a) => {
      // Match by hour prefix (e.g. "09" matches "09:00" and "09:30")
      const hourPrefix = a.scheduled_time.slice(0, 2);
      m.set(`${a.closer_id}-${hourPrefix}`, a);
    });
    return m;
  }, [agendamentos]);

  return (
    <div className="overflow-x-auto rounded-xl border border-primary/10 bg-card">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `60px repeat(${closers.length}, minmax(160px, 1fr))`,
        }}
      >
        {/* Header */}
        <div className="border-b border-primary/10 p-2" />
        {closers.map((c) => (
          <div key={c.id} className="border-b border-l border-primary/10 p-2 text-center">
            <span className="text-xs font-medium">{c.name}</span>
          </div>
        ))}

        {/* Time rows */}
        {DAY_HOURS.map((hour) => {
          const hourPrefix = hour.slice(0, 2);
          return (
            <Fragment key={`row-${hour}`}>
              <div className="border-b border-primary/5 px-2 py-1 text-right flex items-start pt-2">
                <span className="text-[10px] text-muted-foreground font-mono">{hour}</span>
              </div>
              {closers.map((c) => {
                const ag = slotMap.get(`${c.id}-${hourPrefix}`);
                return (
                  <div
                    key={`${c.id}-${hour}`}
                    className="border-b border-l border-primary/5 px-1 py-1 min-h-[52px]"
                  >
                    {ag && (
                      <div
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-[11px] space-y-0.5",
                          STATUS_COLORS[ag.status] || "bg-secondary"
                        )}
                      >
                        <div className="font-semibold truncate">{ag.lead_name}</div>
                        <div className="flex items-center gap-1 text-[10px] opacity-80">
                          <Clock className="h-2.5 w-2.5" />
                          {ag.scheduled_time}
                          {ag.meet_link && (
                            <a
                              href={ag.meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Video className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agendamento Card (compact for week view) ────────────────────

function AgendamentoCard({
  ag,
  closerName,
  compact,
}: {
  ag: Agendamento;
  closerName: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 space-y-0.5",
        STATUS_COLORS[ag.status] || "bg-secondary"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold truncate">{ag.lead_name}</span>
        {ag.meet_link && (
          <a
            href={ag.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Video className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] opacity-80">
        <Clock className="h-2.5 w-2.5" />
        <span>{ag.scheduled_time}</span>
        {!compact && <span>· {closerName}</span>}
      </div>
      <div className="text-[9px] font-medium uppercase tracking-wider">
        {STATUS_LABELS[ag.status] || ag.status}
      </div>
    </div>
  );
}
