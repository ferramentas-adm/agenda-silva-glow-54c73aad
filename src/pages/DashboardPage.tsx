import { useState, useMemo, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startOfWeek, endOfWeek, addWeeks, format, addDays, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PlusCircle, CalendarOff, ChevronLeft, ChevronRight, Video, Clock, Trash2,
  Phone, User, FileText, CheckCircle2, XCircle, RotateCcw, AlertCircle, Ban,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import { useCloserFilter } from "@/hooks/useCloserFilter";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";
import { useGoogleCalendarEvents, GoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/services/auditLog";
import { toast } from "sonner";

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
  deleted_at: string | null;
  created_by: string;
  created_at: string;
}

// ─── Status helpers ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  confirmada: "bg-primary/20 text-primary border-primary/30",
  realizada: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cancelada: "bg-destructive/20 text-destructive border-destructive/30",
  no_show: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  reagendada: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  nao_confirmada: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
  nao_confirmada: "Não confirmada",
};

// ─── Delete Dialog State (shared) ────────────────────────────────

interface DeleteTarget {
  id: string;
  lead_name: string;
}

// ─── Main Page ───────────────────────────────────────────────────

export default function DashboardPage() {
  const { closers, selectedIds, toggle, isLoading } = useCloserFilter();
  const { pendingCount, syncing, syncNow } = useDataCrazySync();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Detail dialog state
  const [detailAg, setDetailAg] = useState<Agendamento | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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
        .select("id, lead_name, lead_phone, closer_id, scheduled_date, scheduled_time, status, meet_link, observation, deleted_at, created_by, created_at")
        .is("deleted_at", null)
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

  // Delete handler
  const handleDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id,
          deletion_reason: deleteReason.trim(),
        })
        .eq("id", deleteTarget.id);

      if (error) throw error;

      await logAudit("delete_agendamento", "agendamento", deleteTarget.id, {
        lead_name: deleteTarget.lead_name,
        reason: deleteReason.trim(),
      });

      toast.success("Agendamento excluído com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agendamento");
    }
    setDeleting(false);
    setDeleteTarget(null);
    setDeleteReason("");
  };

  // Status update handler
  const handleStatusChange = async (newStatus: string) => {
    if (!detailAg) return;
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: newStatus as any })
        .eq("id", detailAg.id);

      if (error) throw error;

      await logAudit("update_status", "agendamento", detailAg.id, {
        lead_name: detailAg.lead_name,
        old_status: detailAg.status,
        new_status: newStatus,
      });

      toast.success(`Status alterado para ${STATUS_LABELS[newStatus]}`);
      setDetailAg({ ...detailAg, status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status");
    }
    setUpdatingStatus(false);
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4">
        <DataCrazySyncIndicator pendingCount={pendingCount} syncing={syncing} onSyncNow={syncNow} />

        {/* Status counters */}
        {!loadingAgendamentos && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { key: "total", label: "Total", icon: AlertCircle, color: "text-foreground", bg: "bg-secondary" },
              { key: "confirmada", label: "Confirmadas", icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10" },
              { key: "realizada", label: "Realizadas", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { key: "cancelada", label: "Canceladas", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
              { key: "no_show", label: "No-shows", icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
              { key: "reagendada", label: "Reagendadas", icon: RotateCcw, color: "text-blue-400", bg: "bg-blue-500/10" },
              { key: "nao_confirmada", label: "Não confirmadas", icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
            ].map(({ key, label, icon: Icon, color, bg }) => {
              const count = key === "total" ? filtered.length : filtered.filter(a => a.status === key).length;
              return (
                <div key={key} className={cn("rounded-xl border border-primary/10 p-3 flex items-center gap-3", bg)}>
                  <Icon className={cn("h-5 w-5 shrink-0", color)} />
                  <div>
                    <p className="text-lg font-bold leading-none">{count}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium min-w-[100px] text-center">
              {viewMode === "week"
                ? `${format(weekStart, "dd/MM")} — ${format(weekEnd, "dd/MM")}`
                : format(currentDate, "dd/MM/yyyy")}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-1" onClick={goToday}>
              Hoje
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
            onDelete={setDeleteTarget}
            onClickAg={setDetailAg}
          />
        ) : (
          <DayView
            date={currentDate}
            closers={closers.filter((c) => selectedIds.has(c.id))}
            agendamentos={filtered}
            onDelete={setDeleteTarget}
            onClickAg={setDetailAg}
          />
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o agendamento de <strong>{deleteTarget?.lead_name}</strong>?
              Informe a justificativa abaixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Justificativa da exclusão (obrigatório)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !deleteReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail / Status change dialog */}
      <Dialog open={!!detailAg} onOpenChange={(open) => { if (!open) setDetailAg(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {detailAg?.lead_name}
            </DialogTitle>
            <DialogDescription>Detalhes do agendamento</DialogDescription>
          </DialogHeader>

          {detailAg && (
            <div className="space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Data</p>
                  <p className="font-medium">{format(new Date(detailAg.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Horário</p>
                  <p className="font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{detailAg.scheduled_time}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Closer</p>
                  <p className="font-medium">{closerMap.get(detailAg.closer_id) || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Telefone</p>
                  <p className="font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{detailAg.lead_phone}</p>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Status atual</p>
                <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[detailAg.status])}>
                  {STATUS_LABELS[detailAg.status] || detailAg.status}
                </Badge>
              </div>

              {/* Meet link */}
              {detailAg.meet_link && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Link da reunião</p>
                  <a href={detailAg.meet_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Video className="h-3.5 w-3.5" />
                    Abrir reunião
                  </a>
                </div>
              )}

              {/* Observation */}
              {detailAg.observation && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Observações</p>
                  <p className="text-sm bg-secondary/50 rounded-md p-2">{detailAg.observation}</p>
                </div>
              )}

              {/* Status actions */}
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium">Alterar status</p>
                <div className="flex flex-wrap gap-2">
                  {detailAg.status !== "confirmada" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10" disabled={updatingStatus} onClick={() => handleStatusChange("confirmada")}>
                      <CheckCircle2 className="h-3.5 w-3.5" />Confirmar
                    </Button>
                  )}
                  {detailAg.status !== "realizada" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("realizada")}>
                      <CheckCircle2 className="h-3.5 w-3.5" />Realizada
                    </Button>
                  )}
                  {detailAg.status !== "cancelada" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" disabled={updatingStatus} onClick={() => handleStatusChange("cancelada")}>
                      <XCircle className="h-3.5 w-3.5" />Cancelar
                    </Button>
                  )}
                  {detailAg.status !== "no_show" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-orange-500/30 text-orange-500 hover:bg-orange-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("no_show")}>
                      <AlertCircle className="h-3.5 w-3.5" />No-show
                    </Button>
                  )}
                  {(detailAg.status === "cancelada" || detailAg.status === "no_show") && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-blue-500/30 text-blue-500 hover:bg-blue-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("reagendada")}>
                      <RotateCcw className="h-3.5 w-3.5" />Reagendar
                    </Button>
                  )}
                  {detailAg.status !== "nao_confirmada" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("nao_confirmada")}>
                      <AlertCircle className="h-3.5 w-3.5" />Não confirmada
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Week View ───────────────────────────────────────────────────

function WeekView({
  days,
  agendamentos,
  closerMap,
  onDelete,
  onClickAg,
}: {
  days: Date[];
  agendamentos: Agendamento[];
  closerMap: Map<string, string>;
  onDelete: (target: DeleteTarget) => void;
  onClickAg: (ag: Agendamento) => void;
}) {
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
                    onDelete={onDelete}
                    onClick={() => onClickAg(ag)}
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

const DAY_HOURS = Array.from({ length: 15 }, (_, i) => `${String(i + 9).padStart(2, "0")}:00`);

function DayView({
  date,
  closers,
  agendamentos,
  onDelete,
  onClickAg,
}: {
  date: Date;
  closers: { id: string; name: string }[];
  agendamentos: Agendamento[];
  onDelete: (target: DeleteTarget) => void;
  onClickAg: (ag: Agendamento) => void;
}) {
  const slotMap = useMemo(() => {
    const m = new Map<string, Agendamento>();
    agendamentos.forEach((a) => {
      const hourPrefix = a.scheduled_time.slice(0, 2);
      m.set(`${a.closer_id}-${hourPrefix}`, a);
    });
    return m;
  }, [agendamentos]);

  if (closers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-primary/20 bg-card py-12 text-center">
        <p className="text-sm text-muted-foreground">Selecione ao menos um closer para ver a agenda do dia.</p>
      </div>
    );
  }

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
                          "rounded-md border px-2 py-1.5 text-[11px] space-y-0.5 group relative cursor-pointer",
                          STATUS_COLORS[ag.status] || "bg-secondary"
                        )}
                        onClick={() => onClickAg(ag)}
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
                          <button
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDelete({ id: ag.id, lead_name: ag.lead_name }); }}
                            title="Excluir agendamento"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
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
  onDelete,
  onClick,
}: {
  ag: Agendamento;
  closerName: string;
  compact?: boolean;
  onDelete: (target: DeleteTarget) => void;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 space-y-0.5 group relative cursor-pointer",
        STATUS_COLORS[ag.status] || "bg-secondary"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold truncate">{ag.lead_name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {ag.meet_link && (
            <a
              href={ag.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <Video className="h-3 w-3" />
            </a>
          )}
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete({ id: ag.id, lead_name: ag.lead_name }); }}
            title="Excluir agendamento"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
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
