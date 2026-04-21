import { useState, useMemo, useEffect, Fragment, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PlusCircle, CalendarOff, ChevronLeft, ChevronRight, Video, Clock, Trash2,
  Phone, User, FileText, CheckCircle2, XCircle, RotateCcw, AlertCircle, Ban,
  CalendarDays, Pencil, Users, PenLine,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import BriefingDrawer from "@/components/BriefingDrawer";
import { useCloserFilter } from "@/hooks/useCloserFilter";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/services/auditLog";
import { toast } from "sonner";
import { useDeletionReasons } from "@/hooks/useDeletionReasons";
import VendaDialog from "@/components/VendaDialog";

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
  briefing: string | null;
  deleted_at: string | null;
  created_by: string;
  sdr_responsavel_id: string | null;
  created_at: string;
  meeting_reason: string | null;
  channel_type: string | null;
  briefing_read_at: string | null;
  briefing_read_by: string | null;
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
  // Reagendada exibe-se como Confirmada na UI (mas no banco continua 'reagendada'
  // para que o webhook do DataCrazy envie status "Reagendada")
  reagendada: "bg-primary/20 text-primary",
};

const STATUS_LABELS: Record<string, string> = {
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  // Visualmente o lead reagendado aparece como "Confirmada" na sua nova data
  reagendada: "Confirmada",
};


const CANCELLED_STATUSES = ["cancelada", "no_show"];

// ─── Delete Dialog State ─────────────────────────────────────────
interface DeleteTarget {
  id: string;
  lead_name: string;
  closer_id?: string | null;
  scheduled_date: string;
  scheduled_time: string;
}

// ─── Main Page ───────────────────────────────────────────────────
export function CalendarContent() {
  const { closers, selectedIds, toggle, isLoading, isCloserRole } = useCloserFilter();
  
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: deletionReasons = [] } = useDeletionReasons();
  const isAdminLike = role === "gestor" || role === "moderador";
  const visibleReasons = useMemo(
    () => deletionReasons.filter((r) => !r.restricted || isAdminLike),
    [deletionReasons, isAdminLike]
  );

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [detailAg, setDetailAg] = useState<Agendamento | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [rescheduleOffer, setRescheduleOffer] = useState<Agendamento | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTime, setEditTime] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingBriefing, setSavingBriefing] = useState(false);
  const [viewBriefing, setViewBriefing] = useState(false);
  const [vendaDialogAg, setVendaDialogAg] = useState<Agendamento | null>(null);
  // Transfer lead between closers
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);

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
        .select("id, lead_name, lead_phone, closer_id, scheduled_date, scheduled_time, status, meet_link, observation, briefing, deleted_at, created_by, sdr_responsavel_id, created_at, meeting_reason, channel_type, briefing_read_at, briefing_read_by")
        .is("deleted_at", null)
        .eq("scheduled_date", dateStr)
        .order("scheduled_time", { ascending: true });
      return (data ?? []) as Agendamento[];
    },
  });

  // Fetch user roles to differentiate SDR vs Closer created appointments
  const { data: userRolesMap = new Map<string, string>() } = useQuery({
    queryKey: ["user-roles-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role");
      const map = new Map<string, string>();
      (data ?? []).forEach((r: { user_id: string; role: string }) => map.set(r.user_id, r.role));
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch profiles for name resolution (responsável, briefing reader, etc.)
  // Usa RPC pública (sem expor email/flags) para que SDRs também consigam
  // resolver nomes de outros usuários.
  const { data: profilesMap = new Map<string, string>() } = useQuery({
    queryKey: ["profiles-name-map"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_profiles");
      const map = new Map<string, string>();
      (data ?? []).forEach((p: { user_id: string; full_name: string }) => map.set(p.user_id, p.full_name));
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

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

  // Fetch closer personal blocks for the day (incluindo recorrentes do mesmo dia da semana)
  const dayWeekday = useMemo(() => {
    const d = new Date(dateStr + "T12:00:00");
    return d.getDay();
  }, [dateStr]);
  const { data: closerBlocks = [] } = useQuery<CloserBlock[]>({
    queryKey: ["closer-blocks-day", closerIdsKey, dateStr, dayWeekday],
    enabled: closerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("closer_blocks")
        .select("closer_id, block_date, start_time, end_time, block_type, description, is_recurring, recurrence_weekday")
        .or(`and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${dayWeekday})`)
        .in("closer_id", closerIds);
      return (data ?? []) as CloserBlock[];
    },
  });

  const filtered = useMemo(
    () => agendamentos.filter((a) => a.closer_id && selectedIds.has(a.closer_id)),
    [agendamentos, selectedIds]
  );

  const patchAgendamentosCache = useCallback(
    (agendamentoId: string, updater: (agendamento: Agendamento) => Agendamento | null) => {
      queryClient.setQueriesData<Agendamento[]>({ queryKey: ["agendamentos"] }, (current) => {
        if (!Array.isArray(current)) return current;

        return current
          .map((agendamento) => (agendamento.id === agendamentoId ? updater(agendamento) : agendamento))
          .filter((agendamento): agendamento is Agendamento => agendamento !== null);
      });
    },
    [queryClient]
  );

  const goPrev = () => setCurrentDate((d) => addDays(d, -1));
  const goNext = () => setCurrentDate((d) => addDays(d, 1));
  const goToday = () => setCurrentDate(new Date());

  // SDR-only filtered agendamentos for metrics (uses sdr_responsavel_id when set, else created_by)
  const sdrFiltered = useMemo(
    () => filtered.filter((a) => {
      const sdrUserId = a.sdr_responsavel_id || a.created_by;
      if (!sdrUserId) return false;
      const role = userRolesMap.get(sdrUserId);
      return role === "sdr";
    }),
    [filtered, userRolesMap]
  );

  // Closer-created agendamentos count for metrics
  const closerCreatedCount = useMemo(
    () => filtered.filter((a) => {
      if (a.sdr_responsavel_id) return false;
      if (!a.created_by) return false;
      const creatorRole = userRolesMap.get(a.created_by);
      return creatorRole === "closer";
    }).length,
    [filtered, userRolesMap]
  );

  const statusCounts = useMemo(
    () =>
      sdrFiltered.reduce<Record<string, number>>((acc, agendamento) => {
        acc[agendamento.status] = (acc[agendamento.status] ?? 0) + 1;
        return acc;
      }, {}),
    [sdrFiltered]
  );

  const closerMap = useMemo(() => {
    const m = new Map<string, string>();
    closers.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [closers]);

  // Closer só pode alterar status do PRÓPRIO agendamento (defesa em profundidade — RLS já bloqueia no banco)
  const myCloserId = useMemo(() => {
    if (role !== "closer" || !user?.email) return null;
    const myCloser = closers.find((c) => c.email?.toLowerCase() === user.email!.toLowerCase());
    return myCloser?.id ?? null;
  }, [role, user?.email, closers]);

  const canChangeStatus = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "moderador") return true;
    if (role === "sdr") return detailAg.created_by === user?.id || (detailAg as any).sdr_responsavel_id === user?.id;
    if (role === "closer") return myCloserId !== null && detailAg.closer_id === myCloserId;
    return false;
  }, [detailAg, role, user?.id, myCloserId]);

  // Quem pode editar o Closer da reunião: gestor/moderador (qualquer) ou SDR APENAS no agendamento que ele próprio criou.
  const canEditCloser = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "moderador") return true;
    if (role === "sdr") return detailAg.created_by === user?.id;
    return false;
  }, [detailAg, role, user?.id]);

  // Quem pode editar o SDR responsável: gestor/moderador (qualquer) ou SDR APENAS no agendamento que ele próprio criou.
  const canEditSdr = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "moderador") return true;
    if (role === "sdr") return detailAg.created_by === user?.id;
    return false;
  }, [detailAg, role, user?.id]);

  // Quem pode TRANSFERIR o lead para outro closer:
  // - gestor / moderador: sempre
  // - closer: APENAS se for o dono atual do lead (nunca pode "puxar" lead de outro)
  const canTransfer = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "moderador") return true;
    if (role === "closer") return myCloserId !== null && detailAg.closer_id === myCloserId;
    return false;
  }, [detailAg, role, myCloserId]);

  const handleTransferLead = async () => {
    if (!detailAg || !transferTarget || transferTarget === detailAg.closer_id) return;
    setTransferring(true);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ closer_id: transferTarget } as any)
        .eq("id", detailAg.id);
      if (error) throw error;
      const oldName = closerMap.get(detailAg.closer_id) || "—";
      const newName = closerMap.get(transferTarget) || "—";
      await logAudit("transfer_lead", "agendamento", detailAg.id, {
        lead_name: detailAg.lead_name,
        scheduled_date: detailAg.scheduled_date,
        scheduled_time: detailAg.scheduled_time,
        from_closer: oldName,
        to_closer: newName,
      });
      patchAgendamentosCache(detailAg.id, (a) => ({ ...a, closer_id: transferTarget }));
      setDetailAg({ ...detailAg, closer_id: transferTarget });
      toast.success(`Lead transferido para ${newName}`);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      setTransferOpen(false);
      setTransferTarget("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao transferir lead");
    }
    setTransferring(false);
  };

  // Lista de usuários (qualquer função) para selecionar como responsável
  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users-for-detail"],
    enabled: canEditSdr,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("active", true)
        .order("full_name");
      return data ?? [];
    },
  });

  const handleChangeCloser = async (newCloserId: string) => {
    if (!detailAg || newCloserId === detailAg.closer_id) return;
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ closer_id: newCloserId } as any)
        .eq("id", detailAg.id);
      if (error) throw error;
      const oldName = closerMap.get(detailAg.closer_id) || "—";
      const newName = closerMap.get(newCloserId) || "—";
      await logAudit("edit_agendamento", "agendamento", detailAg.id, {
        lead_name: detailAg.lead_name,
        scheduled_date: detailAg.scheduled_date,
        scheduled_time: detailAg.scheduled_time,
        old_closer: oldName,
        new_closer: newName,
        field: "closer_id",
      });
      patchAgendamentosCache(detailAg.id, (a) => ({ ...a, closer_id: newCloserId }));
      setDetailAg({ ...detailAg, closer_id: newCloserId });
      toast.success(`Closer alterado para ${newName}`);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar closer");
    }
  };

  const handleChangeSdr = async (newSdrId: string) => {
    if (!detailAg) return;
    const currentSdr = (detailAg as any).sdr_responsavel_id || detailAg.created_by;
    if (newSdrId === currentSdr) return;
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ sdr_responsavel_id: newSdrId } as any)
        .eq("id", detailAg.id);
      if (error) throw error;
      const oldName = currentSdr ? (profilesMap.get(currentSdr) || "—") : "—";
      const newName = profilesMap.get(newSdrId) || "—";
      await logAudit("edit_agendamento", "agendamento", detailAg.id, {
        lead_name: detailAg.lead_name,
        scheduled_date: detailAg.scheduled_date,
        scheduled_time: detailAg.scheduled_time,
        old_sdr: oldName,
        new_sdr: newName,
        field: "sdr_responsavel_id",
      });
      patchAgendamentosCache(detailAg.id, (a) => ({ ...a, sdr_responsavel_id: newSdrId }));
      setDetailAg({ ...detailAg, sdr_responsavel_id: newSdrId } as any);
      toast.success(`Responsável alterado para ${newName}`);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar responsável");
    }
  };

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
      await logAudit("delete_agendamento", "agendamento", deleteTarget.id, { lead_name: deleteTarget.lead_name, closer_name: closerMap.get(deleteTarget.closer_id ?? "") || "", scheduled_date: deleteTarget.scheduled_date, scheduled_time: deleteTarget.scheduled_time, reason: deleteReason.trim() });
      toast.success("Agendamento excluído com sucesso.");
      await queryClient.refetchQueries({ queryKey: ["agendamentos"] });
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
    // Realizada → abre pop-up de Vendeu? (bloqueia submit até preencher)
    if (newStatus === "realizada") {
      setVendaDialogAg(detailAg);
      return;
    }
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: newStatus as any })
        .eq("id", detailAg.id);
      if (error) throw error;
      await logAudit("update_status", "agendamento", detailAg.id, { lead_name: detailAg.lead_name, closer_name: closerMap.get(detailAg.closer_id ?? "") || "", scheduled_date: detailAg.scheduled_date, scheduled_time: detailAg.scheduled_time, old_status: detailAg.status, new_status: newStatus });
      toast.success(`Status alterado para ${STATUS_LABELS[newStatus]}`);
      const updatedAg = { ...detailAg, status: newStatus };
      patchAgendamentosCache(detailAg.id, (agendamento) => ({ ...agendamento, status: newStatus }));
      setDetailAg(updatedAg);
      await queryClient.refetchQueries({ queryKey: ["agendamentos", detailAg.scheduled_date], exact: true });
      if (newStatus === "cancelada" || newStatus === "no_show") {
        setDetailAg(null);
        setRescheduleOffer(updatedAg);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status");
    }
    setUpdatingStatus(false);
  };

  // Open edit mode
  const startEdit = () => {
    if (!detailAg) return;
    setEditTime(detailAg.scheduled_time);
    setEditMode(true);
  };

  // Handle edit save — same day only, just update time
  const handleEditSave = async () => {
    if (!detailAg || !editTime) return;

    if (editTime === detailAg.scheduled_time) {
      setEditMode(false);
      return;
    }

    setSavingEdit(true);
    try {
      // Atualiza o horário e marca status como "reagendada"
      // O trigger notify_status_change_webhook envia o payload completo ao DataCrazy
      const { error } = await supabase
        .from("agendamentos")
        .update({ scheduled_time: editTime, status: "reagendada" } as any)
        .eq("id", detailAg.id);
      if (error) throw error;
      await logAudit("edit_agendamento", "agendamento", detailAg.id, {
        lead_name: detailAg.lead_name,
        closer_name: closerMap.get(detailAg.closer_id ?? "") || "",
        scheduled_date: detailAg.scheduled_date,
        old_time: detailAg.scheduled_time,
        new_time: editTime,
        new_status: "reagendada",
      });
      toast.success("Horário atualizado e reagendamento enviado!");
      setDetailAg({ ...detailAg, scheduled_time: editTime, status: "reagendada" as any });
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar horário");
    }
    setSavingEdit(false);
  };


  return (
    <>
      <div className="animate-fade-in space-y-4">
        

        {/* Status counters */}
        {!loadingAgendamentos && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { key: "total", label: "Total SDRs", icon: AlertCircle, color: "text-foreground", bg: "bg-secondary" },
              { key: "confirmada", label: "Confirmadas", icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10" },
              { key: "realizada", label: "Realizadas", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { key: "cancelada", label: "Canceladas", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
              { key: "no_show", label: "No-shows", icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
              { key: "reagendada", label: "Reagendadas", icon: RotateCcw, color: "text-blue-400", bg: "bg-blue-500/10" },
              {
                key: "nao_comparecimento",
                label: "Não comparecimento",
                icon: Ban,
                color: "text-rose-400",
                bg: "bg-rose-500/10",
              },
            ].map(({ key, label, icon: Icon, color, bg }) => {
              let count: number;
              if (key === "total") count = sdrFiltered.length;
              else if (key === "nao_comparecimento") {
                // Soma dos 3 status que representam ausência do lead
                count =
                  (statusCounts["cancelada"] ?? 0) +
                  (statusCounts["no_show"] ?? 0) +
                  (statusCounts["reagendada"] ?? 0);
              } else {
                count = statusCounts[key] ?? 0;
              }
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
            {/* Closer-created total */}
            <div className={cn("rounded-xl border border-primary/10 p-3 flex items-center gap-3 bg-purple-500/10")}>
              <Users className={cn("h-5 w-5 shrink-0 text-purple-400")} />
              <div>
                <p className="text-lg font-bold leading-none">{closerCreatedCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Closers</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
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
            onClickEmptySlot={(closerId, time) => {
              const dateStr = format(currentDate, "yyyy-MM-dd");
              navigate(`/agendar?closer=${closerId}&date=${dateStr}&time=${time}`);
            }}
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
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Justificativa (obrigatório)</label>
              <Select value={deleteReason} onValueChange={setDeleteReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a justificativa" />
                </SelectTrigger>
                <SelectContent>
                  {visibleReasons.length === 0 ? (
                    <SelectItem value="__none" disabled>Nenhuma justificativa cadastrada</SelectItem>
                  ) : (
                    visibleReasons.map((r) => (
                      <SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
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
      <Dialog open={!!detailAg} onOpenChange={(open) => {
        if (!open) {
          if (viewBriefing) return;
          setDetailAg(null);
          setEditMode(false);
          setViewBriefing(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {detailAg?.lead_name}
            </DialogTitle>
            <DialogDescription>Detalhes do agendamento</DialogDescription>
          </DialogHeader>

          {detailAg && !editMode && (
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
                  {canEditCloser ? (
                    <Select value={detailAg.closer_id || ""} onValueChange={handleChangeCloser}>
                      <SelectTrigger className="h-8 text-sm font-medium">
                        <SelectValue placeholder="Selecionar closer" />
                      </SelectTrigger>
                      <SelectContent>
                        {closers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">{closerMap.get(detailAg.closer_id) || "—"}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Telefone</p>
                  <p className="font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{detailAg.lead_phone}</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-muted-foreground text-xs">Responsável pelo agendamento</p>
                  {canEditSdr ? (
                    <Select
                      value={((detailAg as any).sdr_responsavel_id || detailAg.created_by || "")}
                      onValueChange={handleChangeSdr}
                    >
                      <SelectTrigger className="h-8 text-sm font-medium">
                        <SelectValue placeholder="Selecionar responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsers.map((u: any) => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium flex items-center gap-1"><User className="h-3.5 w-3.5" />{(() => {
                      const sdrId = (detailAg as any).sdr_responsavel_id || detailAg.created_by;
                      return sdrId ? (profilesMap.get(sdrId) || "—") : "—";
                    })()}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Status atual</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("text-xs", STATUS_BADGE_COLORS[detailAg.status])}>
                    {STATUS_LABELS[detailAg.status] || detailAg.status}
                  </Badge>
                  {detailAg.meeting_reason && (
                    <Badge variant="outline" className="text-xs bg-violet-500/20 text-violet-400 border-violet-500/30">
                      {detailAg.meeting_reason}
                    </Badge>
                  )}
                  {detailAg.channel_type && (
                    <Badge variant="outline" className="text-xs bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                      {detailAg.channel_type}
                    </Badge>
                  )}
                </div>
              </div>

              {detailAg.meet_link && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full" asChild>
                  <a href={detailAg.meet_link} target="_blank" rel="noopener noreferrer">
                    <Video className="h-3.5 w-3.5" />Entrar na reunião (Google Meet)
                  </a>
                </Button>
              )}

              {/* Briefing section - opens drawer */}
              {detailAg.briefing ? (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={() => setViewBriefing(true)}>
                  <FileText className="h-3.5 w-3.5" />Ver briefing
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={() => setViewBriefing(true)}>
                  <FileText className="h-3.5 w-3.5" />Adicionar Briefing
                </Button>
              )}

              {/* Edit button */}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" />Editar horário
              </Button>

              {/* Transfer lead — apenas dono atual (closer) ou gestor/moderador */}
              {canTransfer && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs w-full border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => {
                    setTransferTarget("");
                    setTransferOpen(true);
                  }}
                >
                  <Users className="h-3.5 w-3.5" />Transferir lead para outro closer
                </Button>
              )}

              {canChangeStatus && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium">Alterar status</p>
                  {/* Quando o agendamento já foi reagendado, closers/SDRs não podem mais alterar
                      o status para evitar mudanças acidentais. Apenas gestor/moderador mantém o controle
                      total para correções. */}
                  {detailAg.status === "reagendada" && !isAdminLike ? (
                    <p className="text-[11px] text-muted-foreground italic rounded-md border border-primary/10 bg-muted/30 px-2 py-2">
                      Este agendamento foi marcado como <strong>Reagendada</strong>. Para alterar o status,
                      contate um gestor ou moderador.
                    </p>
                  ) : (
                    <>
                      <p className="text-[10px] text-muted-foreground">
                        Reagendar, Cancelar e No-show são mutuamente exclusivos —
                        juntos compõem o "Não comparecimento" do dia.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {detailAg.status !== "confirmada" && detailAg.status !== "reagendada" && (
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10" disabled={updatingStatus} onClick={() => handleStatusChange("confirmada")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />Confirmar
                          </Button>
                        )}
                        {detailAg.status !== "realizada" && (
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("realizada")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />Realizada
                          </Button>
                        )}
                        {/* Reagendar leva ao fluxo de novo agendamento (cria nova reunião com status reagendada).
                            Mutuamente exclusivo com Cancelar/No-show. */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                          disabled={updatingStatus}
                          onClick={() => {
                            if (!detailAg) return;
                            const params = new URLSearchParams({
                              edit: detailAg.id,
                              lead_name: detailAg.lead_name,
                              lead_phone: detailAg.lead_phone,
                            });
                            setDetailAg(null);
                            navigate(`/agendar?${params.toString()}`);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />Reagendar
                        </Button>
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
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Edit mode — time only (same day) */}
          {detailAg && editMode && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione um novo horário para hoje ({format(new Date(detailAg.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}).
              </p>

              <div className="space-y-2">
                <label className="text-sm font-medium">Horário</label>
                <EditTimeSlots
                  closerId={detailAg.closer_id}
                  date={new Date(detailAg.scheduled_date + "T12:00:00")}
                  selectedTime={editTime}
                  onSelect={setEditTime}
                  currentAgId={detailAg.id}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setEditMode(false)}>
                  Cancelar
                </Button>
                <Button className="flex-1" disabled={!editTime || editTime === detailAg.scheduled_time || savingEdit} onClick={handleEditSave}>
                  {savingEdit ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer lead dialog */}
      <Dialog open={transferOpen} onOpenChange={(o) => { if (!o) { setTransferOpen(false); setTransferTarget(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Transferir lead
            </DialogTitle>
            <DialogDescription>
              Selecione o closer que receberá o lead{" "}
              <strong>{detailAg?.lead_name}</strong>. O agendamento permanecerá no mesmo
              horário ({detailAg?.scheduled_time}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Closer atual</p>
              <p className="text-sm font-medium">
                {detailAg ? (closerMap.get(detailAg.closer_id) || "—") : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Novo closer</label>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar closer destinatário" />
                </SelectTrigger>
                <SelectContent>
                  {closers
                    .filter((c) => c.id !== detailAg?.closer_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setTransferOpen(false); setTransferTarget(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleTransferLead}
              disabled={!transferTarget || transferring}
            >
              {transferring ? "Transferindo..." : "Transferir"}
            </Button>
          </div>
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
                if (rescheduleOffer) {
                  const params = new URLSearchParams({
                    edit: rescheduleOffer.id,
                    lead_name: rescheduleOffer.lead_name,
                    lead_phone: rescheduleOffer.lead_phone,
                  });
                  navigate(`/agendar?${params.toString()}`);
                }
                setRescheduleOffer(null);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reagendar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Briefing Drawer */}
      <BriefingDrawer
        open={viewBriefing}
        briefing={detailAg?.briefing ?? null}
        leadName={detailAg?.lead_name ?? ""}
        closerName={detailAg ? (closerMap.get(detailAg.closer_id) || "—") : ""}
        date={detailAg ? format(new Date(detailAg.scheduled_date + "T12:00:00"), "dd/MM/yyyy") : ""}
        time={detailAg?.scheduled_time ?? ""}
        onClose={() => setViewBriefing(false)}
        briefingReadAt={detailAg?.briefing_read_at ?? null}
        briefingReadByName={detailAg?.briefing_read_by ? (profilesMap.get(detailAg.briefing_read_by) || user?.user_metadata?.full_name || "—") : null}
        showReadButton={role !== "sdr" && !!detailAg?.briefing && !detailAg?.briefing_read_at}
        onMarkRead={async () => {
          if (!detailAg || !user) return;
          try {
            const { error } = await supabase
              .from("agendamentos")
              .update({ briefing_read_at: new Date().toISOString(), briefing_read_by: user.id } as any)
              .eq("id", detailAg.id);
            if (error) throw error;
            const userName = user.user_metadata?.full_name || user.email || "";
            await logAudit("read_briefing", "agendamento", detailAg.id, {
              lead_name: detailAg.lead_name,
              reader_name: userName,
            });
            setDetailAg({ ...detailAg, briefing_read_at: new Date().toISOString(), briefing_read_by: user.id });
            queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
            toast.success("Briefing marcado como lido!");
          } catch (err: any) {
            toast.error(err.message || "Erro ao marcar como lido");
          }
        }}
        onSave={async (text) => {
          if (!detailAg) return;
          setSavingBriefing(true);
          try {
            const { error } = await supabase
              .from("agendamentos")
              .update({ briefing: text.trim(), briefing_read_at: null, briefing_read_by: null } as any)
              .eq("id", detailAg.id);
            if (error) throw error;
            await logAudit("edit_briefing", "agendamento", detailAg.id, {
              lead_name: detailAg.lead_name,
              closer_name: closerMap.get(detailAg.closer_id ?? "") || "",
            });
            toast.success("Briefing salvo com sucesso!");
            setDetailAg({ ...detailAg, briefing: text.trim(), briefing_read_at: null, briefing_read_by: null });
            queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
          } catch (err: any) {
            toast.error(err.message || "Erro ao salvar briefing");
          }
          setSavingBriefing(false);
        }}
        onRemove={async () => {
          if (!detailAg) return;
          setSavingBriefing(true);
          try {
            const { error } = await supabase
              .from("agendamentos")
              .update({ briefing: null, briefing_read_at: null, briefing_read_by: null } as any)
              .eq("id", detailAg.id);
            if (error) throw error;
            await logAudit("remove_briefing", "agendamento", detailAg.id, {
              lead_name: detailAg.lead_name,
            });
            toast.success("Briefing removido!");
            setDetailAg({ ...detailAg, briefing: null, briefing_read_at: null, briefing_read_by: null });
            setViewBriefing(false);
            queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
          } catch (err: any) {
            toast.error(err.message || "Erro ao remover briefing");
          }
          setSavingBriefing(false);
        }}
        saving={savingBriefing}
      />

      {vendaDialogAg && (
        <VendaDialog
          open={!!vendaDialogAg}
          onOpenChange={(o) => !o && setVendaDialogAg(null)}
          agendamentoId={vendaDialogAg.id}
          leadName={vendaDialogAg.lead_name}
          onSuccess={() => {
            patchAgendamentosCache(vendaDialogAg.id, (a) => ({ ...a, status: "realizada" }));
            setDetailAg((d) => (d && d.id === vendaDialogAg.id ? { ...d, status: "realizada" } : d));
            queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
            queryClient.invalidateQueries({ queryKey: ["vendas"] });
          }}
        />
      )}
    </>
  );
}

export default function DashboardPage() {
  return <AppLayout><CalendarContent /></AppLayout>;
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
  onClickEmptySlot,
}: {
  date: Date;
  closers: { id: string; name: string }[];
  agendamentos: Agendamento[];
  busyBlocks: GoogleBusyBlock[];
  closerBlocks: CloserBlock[];
  closerIndexMap: Map<string, number>;
  onDelete: (target: DeleteTarget) => void;
  onClickAg: (ag: Agendamento) => void;
  onClickEmptySlot: (closerId: string, time: string) => void;
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
      for (let h = startHour; h < endHour; h++) {
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
        style={{ gridTemplateColumns: `70px repeat(${closers.length}, minmax(180px, 1fr))` }}
      >
        {/* Header */}
        <div className="border-b border-primary/10 p-2" />
        {closers.map((c) => {
          const idx = closerIndexMap.get(c.id) ?? 0;
          const color = getCloserColor(c.id, idx);
          return (
            <div key={c.id} className={cn("border-b border-l border-primary/10 p-2 text-center", color.text)}>
              <span className="text-sm font-semibold">{c.name}</span>
            </div>
          );
        })}

        {/* Time rows */}
        {DAY_HOURS.map((hour) => {
          const hourPrefix = hour.slice(0, 2);
          return (
            <Fragment key={`row-${hour}`}>
              <div className="border-b border-primary/5 px-2 py-1 text-right flex items-start pt-3">
                <span className="text-sm text-muted-foreground font-mono font-medium">{hour}</span>
              </div>
              {closers.map((c) => {
                const agList = slotMap.get(`${c.id}-${hourPrefix}`) || [];
                const busy = busyMap.get(`${c.id}-${hourPrefix}`) ?? null;
                const block = blockMap.get(`${c.id}-${hourPrefix}`) ?? null;
                const idx = closerIndexMap.get(c.id) ?? 0;
                const closerColor = getCloserColor(c.id, idx);
                const canClickToSchedule = !busy && !block;

                return (
                  <div
                    key={`${c.id}-${hour}`}
                    className={cn(
                      "border-b border-l border-primary/5 px-1.5 py-1.5 min-h-[72px]",
                      canClickToSchedule && "cursor-pointer hover:bg-primary/5 transition-colors"
                    )}
                    onClick={() => {
                      if (canClickToSchedule) {
                        onClickEmptySlot(c.id, hour);
                      }
                    }}
                    title={canClickToSchedule ? `Agendar às ${hour} com ${c.name}` : undefined}
                  >
                    {agList.length > 0 && (
                      <div className="flex gap-0.5 overflow-hidden">
                        {agList.map((ag) => {
                          const isCancelled = CANCELLED_STATUSES.includes(ag.status);
                          const isCompact = agList.length >= 3;
                          return (
                            <div
                              key={ag.id}
                              className={cn(
                                "rounded-md border text-xs group relative cursor-pointer flex-1 min-w-0 overflow-hidden",
                                isCompact ? "px-1.5 py-1 space-y-0" : "px-2 py-2 space-y-0.5",
                                closerColor.bg,
                                closerColor.border,
                                isCancelled && "opacity-60"
                              )}
                              onClick={(e) => { e.stopPropagation(); onClickAg(ag); }}
                              title={`${ag.lead_name} — ${ag.scheduled_time} — ${STATUS_LABELS[ag.status] || ag.status}${ag.meeting_reason ? ` — ${ag.meeting_reason}` : ''}`}
                            >
                              {/* Briefing tag - top-right label */}
                              <span className={cn(
                                "absolute top-0 right-0 rounded-bl-md rounded-tr-md px-1.5 py-0.5 font-bold leading-none",
                                isCompact ? "text-[8px]" : "text-[10px]",
                                ag.briefing
                                  ? "bg-emerald-500/80 text-white"
                                  : "bg-red-500/80 text-white"
                              )}>
                                B
                              </span>
                              <div className={cn("font-semibold truncate pr-5", isCancelled && "line-through", isCompact && "text-[11px]")}>
                                {ag.lead_name}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] opacity-80">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className={cn("truncate", isCancelled && "line-through")}>{ag.scheduled_time}</span>
                                {!isCompact && ag.meet_link && (
                                  <a href={ag.meet_link} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Video className="h-2.5 w-2.5" />
                                  </a>
                                )}
                                <button
                                  className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive p-0.5 -m-0.5 rounded"
                                  onClick={(e) => { e.stopPropagation(); onDelete({ id: ag.id, lead_name: ag.lead_name, closer_id: ag.closer_id, scheduled_date: ag.scheduled_date, scheduled_time: ag.scheduled_time }); }}
                                  title="Excluir agendamento"
                                >
                                  <Trash2 className={cn(isCompact ? "h-3 w-3" : "h-4 w-4")} />
                                </button>
                              </div>
                              {/* Status badges - compact: single line truncated */}
                              <div className={cn("flex gap-0.5 overflow-hidden", isCompact ? "flex-nowrap" : "flex-wrap")}>
                                <span className={cn(
                                  "rounded px-1 py-0.5 font-medium uppercase tracking-wider whitespace-nowrap shrink-0",
                                  isCompact ? "text-[8px]" : "text-[9px]",
                                  STATUS_BADGE_COLORS[ag.status]
                                )}>
                                  {STATUS_LABELS[ag.status] || ag.status}
                                </span>
                                {ag.meeting_reason && (
                                  <span className={cn(
                                    "rounded px-1 py-0.5 font-medium uppercase tracking-wider whitespace-nowrap bg-violet-500/20 text-violet-400",
                                    isCompact ? "text-[8px] hidden" : "text-[9px]"
                                  )}>
                                    {ag.meeting_reason}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {busy && !block && agList.length === 0 && (
                      <div className="rounded-md border border-muted-foreground/20 bg-muted/50 px-2 py-1.5 text-[11px] flex items-center gap-1.5">
                        <Ban className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground font-medium">Ocupado</span>
                      </div>
                    )}
                    {block && (
                      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <CalendarOff className="h-3 w-3 text-amber-400 shrink-0" />
                          <span className="text-amber-400 font-medium">{BLOCK_TYPE_LABELS[block.block_type] || block.block_type}</span>
                        </div>
                        {block.description && (
                          <p className="text-[10px] text-muted-foreground truncate">{block.description}</p>
                        )}
                        <p className="text-[9px] text-muted-foreground">{block.start_time}–{block.end_time}</p>
                      </div>
                    )}
                    {agList.length === 0 && !busy && !block && (
                      <div className="h-full w-full flex items-center justify-center opacity-0 hover:opacity-40 transition-opacity">
                        <PlusCircle className="h-4 w-4 text-primary" />
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

// ─── Edit Time Slots (simplified picker for edit mode) ───────────
function EditTimeSlots({
  closerId,
  date,
  selectedTime,
  onSelect,
  currentAgId,
}: {
  closerId: string;
  date: Date;
  selectedTime: string | null;
  onSelect: (time: string) => void;
  currentAgId: string;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // Fetch closer hours
  const { data: closer } = useQuery({
    queryKey: ["closer-hours-edit", closerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("business_hours_start, business_hours_end, business_hours_ranges")
        .eq("id", closerId)
        .single();
      return data;
    },
  });

  // Fetch booked slots for the date
  const { data: booked = [] } = useQuery({
    queryKey: ["booked-slots-edit", closerId, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, scheduled_time")
        .eq("closer_id", closerId)
        .eq("scheduled_date", dateStr)
        .is("deleted_at", null)
        .not("status", "in", '("cancelada","reagendada")');
      return data ?? [];
    },
  });

  // Get São Paulo time info
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
    };
  }, []);

  const isTodaySP = dateStr === spNow.date;

  const slots = useMemo(() => {
    // Slots fixos: 09h às 23h (independente do horário do closer).
    const allSlots: string[] = [];
    for (let h = 9; h <= 23; h++) allSlots.push(`${String(h).padStart(2, "0")}:00`);

    if (isTodaySP) {
      return allSlots.filter(s => parseInt(s.split(":")[0], 10) > spNow.hour);
    }

    return allSlots;
  }, [closer, dateStr, isTodaySP, spNow.hour]);

  // Booked times (excluding the current agendamento being edited)
  const bookedTimes = useMemo(() => {
    return new Set(booked.filter(b => b.id !== currentAgId).map(b => b.scheduled_time));
  }, [booked, currentAgId]);

  const isCustomSelected = selectedTime !== null && !slots.includes(selectedTime);

  const handleCustomConfirm = () => {
    setCustomError(null);
    const match = customInput.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      setCustomError("Formato inválido. Use HH:MM.");
      return;
    }
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      setCustomError("Horário inválido.");
      return;
    }
    if (isTodaySP && (h < spNow.hour || (h === spNow.hour && m <= spNow.minute))) {
      setCustomError("Horário já passou. Selecione um horário futuro.");
      return;
    }
    onSelect(customInput);
    setCustomMode(false);
  };

  if (!closer) return <Skeleton className="h-10 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {slots.map((slot) => {
          const isBooked = bookedTimes.has(slot);
          return (
            <Button
              key={slot}
              variant={selectedTime === slot ? "default" : isBooked ? "secondary" : "outline"}
              size="sm"
              className={cn("text-xs", isBooked && selectedTime !== slot && "border-amber-500/50")}
              onClick={() => { onSelect(slot); setCustomMode(false); setCustomError(null); }}
            >
              {slot}
              {isBooked && <span className="ml-1 text-[9px] text-amber-500">●</span>}
            </Button>
          );
        })}

        {/* Custom time toggle */}
        <Button
          variant={customMode || isCustomSelected ? "default" : "outline"}
          size="sm"
          className="text-xs border-dashed"
          onClick={() => {
            setCustomMode(!customMode);
            setCustomError(null);
            if (!customMode) setCustomInput("");
          }}
        >
          <PenLine className="h-3.5 w-3.5 mr-1" />
          {isCustomSelected && !customMode ? selectedTime : "Outro"}
        </Button>

        {slots.length === 0 && !customMode && (
          <p className="text-sm text-muted-foreground">Nenhum horário padrão disponível. Use "Outro" para horário personalizado.</p>
        )}
      </div>

      {customMode && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Horário personalizado (ex: 16:20)
            </label>
            <input
              type="time"
              value={customInput}
              onChange={(e) => { setCustomInput(e.target.value); setCustomError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCustomConfirm(); }}
              className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
              autoFocus
            />
            {customError && <p className="text-xs text-destructive">{customError}</p>}
          </div>
          <Button size="sm" onClick={handleCustomConfirm} disabled={!customInput} className="mt-5">
            Confirmar
          </Button>
        </div>
      )}
    </div>
  );
}
