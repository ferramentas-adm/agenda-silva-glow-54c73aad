import { useState, useMemo, useEffect, Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PlusCircle, CalendarOff, ChevronLeft, ChevronRight, Video, Clock, Trash2,
  Phone, User, FileText, CheckCircle2, XCircle, RotateCcw, AlertCircle, Ban,
  CalendarDays,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import { useCloserFilter } from "@/hooks/useCloserFilter";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";
import { GoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

interface GoogleBusyBlock {
  closer_id: string;
  date: string;
  time: string;
  summary: string;
}

interface CloserBlock {
  closer_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  block_type: string;
  description: string | null;
}

// ─── Closer colors ──────────────────────────────────────────────
// Each closer gets a distinct color for their slot background
const CLOSER_COLORS: Record<string, { bg: string; border: string; text: string }> = {};
const CLOSER_COLOR_PALETTE = [
  { bg: "bg-blue-500/15", border: "border-blue-500/40", text: "text-blue-300" },       // André - azul
  { bg: "bg-orange-500/15", border: "border-orange-500/40", text: "text-orange-300" }, // Igor - laranja
  { bg: "bg-emerald-500/15", border: "border-emerald-500/40", text: "text-emerald-300" }, // Pedro - verde
  { bg: "bg-purple-500/15", border: "border-purple-500/40", text: "text-purple-300" }, // Emanuelle - roxo
  { bg: "bg-pink-500/15", border: "border-pink-500/40", text: "text-pink-300" },       // extra
  { bg: "bg-cyan-500/15", border: "border-cyan-500/40", text: "text-cyan-300" },       // extra
];

function getCloserColor(closerId: string, closerIndex: number) {
  return CLOSER_COLOR_PALETTE[closerIndex % CLOSER_COLOR_PALETTE.length];
}

// ─── Status helpers ──────────────────────────────────────────────
const STATUS_BADGE_COLORS: Record<string, string> = {
  confirmada: "bg-primary/20 text-primary",
  realizada: "bg-emerald-500/20 text-emerald-400",
  cancelada: "bg-destructive/20 text-destructive",
  no_show: "bg-orange-500/20 text-orange-400",
  reagendada: "bg-blue-500/20 text-blue-400",
  nao_confirmada: "bg-yellow-500/20 text-yellow-400",
};

const STATUS_LABELS: Record<string, string> = {
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
  nao_confirmada: "Não confirmada",
};

const CANCELLED_STATUSES = ["cancelada", "no_show"];

// ─── Delete Dialog State ─────────────────────────────────────────
interface DeleteTarget {
  id: string;
  lead_name: string;
}

// ─── Main Page ───────────────────────────────────────────────────
export default function DashboardPage() {
  const { closers, selectedIds, toggle, isLoading, isCloserRole } = useCloserFilter();
  const { pendingCount, syncing, syncNow } = useDataCrazySync();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [detailAg, setDetailAg] = useState<Agendamento | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [rescheduleOffer, setRescheduleOffer] = useState<Agendamento | null>(null);

  const dateStr = format(currentDate, "yyyy-MM-dd");

  // Build closer index map for consistent coloring
  const closerIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    // Fixed order: André=0(blue), Igor=1(orange), Pedro=2(green), Emanuelle=3(purple)
    const nameOrder = ["andré", "igor", "pedro", "emanuelle"];
    const sorted = [...closers].sort((a, b) => {
      const aIdx = nameOrder.findIndex(n => a.name.toLowerCase().includes(n));
      const bIdx = nameOrder.findIndex(n => b.name.toLowerCase().includes(n));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
    sorted.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [closers]);

  // Fetch agendamentos for the day
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useQuery<Agendamento[]>({
    queryKey: ["agendamentos", dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, closer_id, scheduled_date, scheduled_time, status, meet_link, observation, deleted_at, created_by, created_at")
        .is("deleted_at", null)
        .eq("scheduled_date", dateStr)
        .order("scheduled_time", { ascending: true });
      return (data ?? []) as Agendamento[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("agendamentos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Fetch Google Calendar events for all selected closers
  const closerIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const closerIdsKey = closerIds.join(",");

  const { data: googleBusyBlocks = [] } = useQuery<GoogleBusyBlock[]>({
    queryKey: ["google-busy-blocks", closerIdsKey, dateStr],
    enabled: closerIds.length > 0,
    queryFn: async () => {
      const blocks: GoogleBusyBlock[] = [];
      await Promise.allSettled(
        closerIds.map(async (cid) => {
          const { data, error } = await supabase.functions.invoke("google-calendar-events", {
            body: { closer_id: cid, date_start: `${dateStr}T00:00:00`, date_end: `${dateStr}T23:59:59` },
          });
          if (error || !data?.connected || !data.events) return;
          (data.events as GoogleCalendarEvent[]).forEach((ev) => {
            if (ev.summary && ev.summary.startsWith("Grupo Silva &")) return;
            const startDate = ev.start ? new Date(ev.start) : null;
            if (!startDate) return;
            blocks.push({
              closer_id: cid,
              date: format(startDate, "yyyy-MM-dd"),
              time: format(startDate, "HH:mm"),
              summary: "Ocupado",
            });
          });
        })
      );
      return blocks;
    },
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Fetch closer personal blocks for the day
  const { data: closerBlocks = [] } = useQuery<CloserBlock[]>({
    queryKey: ["closer-blocks-day", closerIdsKey, dateStr],
    enabled: closerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("closer_blocks")
        .select("closer_id, block_date, start_time, end_time, block_type, description")
        .eq("block_date", dateStr)
        .in("closer_id", closerIds);
      return (data ?? []) as CloserBlock[];
    },
  });

  const filtered = useMemo(
    () => agendamentos.filter((a) => selectedIds.has(a.closer_id)),
    [agendamentos, selectedIds]
  );

  const goPrev = () => setCurrentDate((d) => addDays(d, -1));
  const goNext = () => setCurrentDate((d) => addDays(d, 1));
  const goToday = () => setCurrentDate(new Date());

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
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, deletion_reason: deleteReason.trim() })
        .eq("id", deleteTarget.id);
      if (error) throw error;
      await logAudit("delete_agendamento", "agendamento", deleteTarget.id, { lead_name: deleteTarget.lead_name, reason: deleteReason.trim() });
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
      await logAudit("update_status", "agendamento", detailAg.id, { lead_name: detailAg.lead_name, old_status: detailAg.status, new_status: newStatus });
      toast.success(`Status alterado para ${STATUS_LABELS[newStatus]}`);
      const updatedAg = { ...detailAg, status: newStatus };
      setDetailAg(updatedAg);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      if (newStatus === "cancelada" || newStatus === "no_show") {
        setDetailAg(null);
        setRescheduleOffer(updatedAg);
      }
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
              {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
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
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium min-w-[100px] text-center">
              {format(currentDate, "dd/MM/yyyy")}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-1" onClick={goToday}>
              Hoje
            </Button>

            {/* Calendar picker */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" title="Selecionar data">
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={currentDate}
                  onSelect={(date) => {
                    if (date) {
                      setCurrentDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Closer filter — hidden for closer role (they only see their own) */}
        {!isCloserRole && (
          isLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <CloserFilterBar closers={closers} selectedIds={selectedIds} onToggle={toggle} />
            </div>
          )
        )}

        {/* Content */}
        {isLoading || loadingAgendamentos ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <DayView
            date={currentDate}
            closers={closers.filter((c) => selectedIds.has(c.id))}
            agendamentos={filtered}
            busyBlocks={googleBusyBlocks}
            closerBlocks={closerBlocks}
            closerIndexMap={closerIndexMap}
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
            <Textarea placeholder="Justificativa da exclusão (obrigatório)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="min-h-[80px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting || !deleteReason.trim()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Status atual</p>
                <Badge variant="outline" className={cn("text-xs", STATUS_BADGE_COLORS[detailAg.status])}>
                  {STATUS_LABELS[detailAg.status] || detailAg.status}
                </Badge>
              </div>

              {detailAg.meet_link && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Link da reunião</p>
                  <a href={detailAg.meet_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Video className="h-3.5 w-3.5" />Abrir reunião
                  </a>
                </div>
              )}

              {detailAg.observation && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Observações</p>
                  <p className="text-sm bg-secondary/50 rounded-md p-2">{detailAg.observation}</p>
                </div>
              )}

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
                  {detailAg.status !== "cancelada" && detailAg.status !== "reagendada" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" disabled={updatingStatus} onClick={() => handleStatusChange("cancelada")}>
                      <XCircle className="h-3.5 w-3.5" />Cancelar
                    </Button>
                  )}
                  {detailAg.status !== "no_show" && detailAg.status !== "reagendada" && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-orange-500/30 text-orange-500 hover:bg-orange-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("no_show")}>
                      <AlertCircle className="h-3.5 w-3.5" />No-show
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

      {/* Reschedule offer dialog */}
      <AlertDialog open={!!rescheduleOffer} onOpenChange={(open) => { if (!open) setRescheduleOffer(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-400" />
              Deseja reagendar?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O agendamento de <strong>{rescheduleOffer?.lead_name}</strong> foi marcado como{" "}
              <strong>{rescheduleOffer?.status === "no_show" ? "No-show" : "Cancelado"}</strong>.
              Deseja reagendar uma nova reunião para este lead agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Pular</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                if (rescheduleOffer) navigate(`/agendar?edit=${rescheduleOffer.id}`);
                setRescheduleOffer(null);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reagendar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

// ─── Day View ────────────────────────────────────────────────────
const DAY_HOURS = Array.from({ length: 15 }, (_, i) => `${String(i + 9).padStart(2, "0")}:00`);

function DayView({
  date,
  closers,
  agendamentos,
  busyBlocks,
  closerBlocks,
  closerIndexMap,
  onDelete,
  onClickAg,
}: {
  date: Date;
  closers: { id: string; name: string }[];
  agendamentos: Agendamento[];
  busyBlocks: GoogleBusyBlock[];
  closerBlocks: CloserBlock[];
  closerIndexMap: Map<string, number>;
  onDelete: (target: DeleteTarget) => void;
  onClickAg: (ag: Agendamento) => void;
}) {
  const BLOCK_TYPE_LABELS: Record<string, string> = {
    almoco: "Almoço",
    pessoal: "Pessoal",
    externo: "Externo",
    folga: "Folga",
    outro: "Outro",
  };

  // Group agendamentos by closer+hour — allow MULTIPLE per slot (stacking)
  const slotMap = useMemo(() => {
    const m = new Map<string, Agendamento[]>();
    agendamentos.forEach((a) => {
      const hourPrefix = a.scheduled_time.slice(0, 2);
      const key = `${a.closer_id}-${hourPrefix}`;
      const list = m.get(key) || [];
      list.push(a);
      m.set(key, list);
    });
    return m;
  }, [agendamentos]);

  const busyMap = useMemo(() => {
    const m = new Map<string, GoogleBusyBlock>();
    busyBlocks.forEach((b) => {
      const hourPrefix = b.time.slice(0, 2);
      const key = `${b.closer_id}-${hourPrefix}`;
      if (!m.has(key)) m.set(key, b);
    });
    return m;
  }, [busyBlocks]);

  // Map closer blocks by closer+hour
  const blockMap = useMemo(() => {
    const m = new Map<string, CloserBlock>();
    closerBlocks.forEach((b) => {
      const startHour = parseInt(b.start_time.slice(0, 2));
      const endHour = parseInt(b.end_time.slice(0, 2));
      for (let h = startHour; h <= endHour; h++) {
        const key = `${b.closer_id}-${String(h).padStart(2, "0")}`;
        if (!m.has(key)) m.set(key, b);
      }
    });
    return m;
  }, [closerBlocks]);

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
        style={{ gridTemplateColumns: `60px repeat(${closers.length}, minmax(160px, 1fr))` }}
      >
        {/* Header */}
        <div className="border-b border-primary/10 p-2" />
        {closers.map((c) => {
          const idx = closerIndexMap.get(c.id) ?? 0;
          const color = getCloserColor(c.id, idx);
          return (
            <div key={c.id} className={cn("border-b border-l border-primary/10 p-2 text-center", color.text)}>
              <span className="text-xs font-semibold">{c.name}</span>
            </div>
          );
        })}

        {/* Time rows */}
        {DAY_HOURS.map((hour) => {
          const hourPrefix = hour.slice(0, 2);
          return (
            <Fragment key={`row-${hour}`}>
              <div className="border-b border-primary/5 px-2 py-1 text-right flex items-start pt-2">
                <span className="text-[10px] text-muted-foreground font-mono">{hour}</span>
              </div>
              {closers.map((c) => {
                const agList = slotMap.get(`${c.id}-${hourPrefix}`) || [];
                const busy = agList.length === 0 ? busyMap.get(`${c.id}-${hourPrefix}`) : null;
                const idx = closerIndexMap.get(c.id) ?? 0;
                const closerColor = getCloserColor(c.id, idx);

                return (
                  <div
                    key={`${c.id}-${hour}`}
                    className="border-b border-l border-primary/5 px-1 py-1 min-h-[52px]"
                  >
                    {agList.length > 0 ? (
                      <div className="space-y-1">
                        {agList.map((ag) => {
                          const isCancelled = CANCELLED_STATUSES.includes(ag.status);
                          return (
                            <div
                              key={ag.id}
                              className={cn(
                                "rounded-md border px-2 py-1.5 text-[11px] space-y-0.5 group relative cursor-pointer",
                                closerColor.bg,
                                closerColor.border,
                                isCancelled && "opacity-60"
                              )}
                              onClick={() => onClickAg(ag)}
                            >
                              <div className={cn("font-semibold truncate", isCancelled && "line-through")}>
                                {ag.lead_name}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] opacity-80">
                                <Clock className="h-2.5 w-2.5" />
                                <span className={cn(isCancelled && "line-through")}>{ag.scheduled_time}</span>
                                {ag.meet_link && (
                                  <a href={ag.meet_link} target="_blank" rel="noopener noreferrer" className="ml-auto" onClick={(e) => e.stopPropagation()}>
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
                              {/* Status badge with its own color */}
                              <span className={cn(
                                "inline-block rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                                STATUS_BADGE_COLORS[ag.status]
                              )}>
                                {STATUS_LABELS[ag.status] || ag.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : busy ? (
                      <div className="rounded-md border border-muted-foreground/20 bg-muted/50 px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                        <Ban className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground font-medium">Ocupado</span>
                      </div>
                    ) : null}
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
