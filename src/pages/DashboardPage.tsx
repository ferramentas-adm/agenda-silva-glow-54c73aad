import { useState, useMemo, useEffect, useRef, Fragment, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PlusCircle, CalendarOff, ChevronLeft, ChevronRight, Video, Clock, Trash2,
  Phone, User, FileText, CheckCircle2, XCircle, RotateCcw, AlertCircle, Ban,
  CalendarDays, Pencil, Users, PenLine, Hourglass,
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
import { isSdrOverrideName } from "@/lib/sdrOverrides";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/services/auditLog";
// resendAgendamentoWebhook removido: edição de horário agora limpa o closer e o
// webhook é disparado naturalmente ao reatribuir via Aguardando atribuição.
import { toast } from "sonner";
import { useDeletionReasons } from "@/hooks/useDeletionReasons";
import VendaDialog from "@/components/VendaDialog";
import CancelReasonDialog from "@/components/CancelReasonDialog";
import { useCan } from "@/hooks/usePermissions";
import { useSlotCounts } from "@/hooks/useSlotCounts";
import { useSlotLimit } from "@/hooks/useSlotLimit";
import { AlertTriangle } from "lucide-react";


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
  original_agendamento_id: string | null;
  duration_minutes: number | null;
  is_5k: boolean | null;
}

// ─── Status efetivo ──────────────────────────────────────────────
// Mantido apenas para compatibilidade nos call sites. Hoje retorna o status real:
// reagendamentos novos entram como 'agendada' e precisam passar pelo fluxo de
// confirmação novamente, então não existe mais o caso híbrido reagendada+original_id.
function getEffectiveStatus(ag: { status: string; original_agendamento_id?: string | null }): string {
  return ag.status;
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
  agendada: "bg-blue-500/20 text-blue-400",
  confirmada: "bg-primary/20 text-primary",
  realizada: "bg-emerald-500/20 text-emerald-400",
  cancelada: "bg-destructive/20 text-destructive",
  no_show: "bg-orange-500/20 text-orange-400",
  // Reagendada: o card no dia ORIGINAL exibe "Reagendada" (lead movido para outra data).
  // O novo agendamento na nova data é criado com status 'confirmada'.
  reagendada: "bg-blue-500/20 text-blue-400",
};

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendado",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
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
  const canEditTime = useCan("edit_appointment_time");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: deletionReasons = [] } = useDeletionReasons();
  const isAdminLike = role === "gestor" || role === "moderador" || role === "supervisor";
  const visibleReasons = useMemo(
    () => deletionReasons.filter((r) => !r.restricted || isAdminLike),
    [deletionReasons, isAdminLike]
  );

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedSdrId, setSelectedSdrId] = useState<string>("all");

  // SDRs disponíveis para filtragem (somente gestor/moderador veem esse filtro)
  const { data: sdrUsers = [] } = useQuery({
    queryKey: ["sdr-users-calendar-filter"],
    enabled: isAdminLike,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return [] as { user_id: string; full_name: string }[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids)
        .eq("active", true)
        .order("full_name", { ascending: true });
      return (profiles ?? []) as { user_id: string; full_name: string }[];
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [detailAg, setDetailAg] = useState<Agendamento | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false);
  
  const [editMode, setEditMode] = useState(false);
  const [editTime, setEditTime] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingBriefing, setSavingBriefing] = useState(false);
  const [viewBriefing, setViewBriefing] = useState(false);
  const [viewJustification, setViewJustification] = useState(false);
  const [vendaDialogAg, setVendaDialogAg] = useState<Agendamento | null>(null);
  // Transfer lead between closers (mantido em código; botão escondido na UI)
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Reagendar (cria nova agenda em outro dia/horário, marca original como "reagendada")
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const dateStr = format(currentDate, "yyyy-MM-dd");

  // Slot lotação dinâmica (capacidade = closers ativos disponíveis no horário)
  const { data: slotCounts } = useSlotCounts(dateStr);
  const { limit: slotLimit } = useSlotLimit();
  const slotAlerts = useMemo(() => {
    const full: { time: string; count: number }[] = [];
    const nearly: { time: string; count: number }[] = [];
    const entries = Array.from(slotCounts?.entries() ?? []).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [time, info] of entries) {
      if (info.full) full.push({ time, count: info.count });
      else if (info.capacity > 0 && info.count >= Math.max(1, info.capacity - 2)) {
        nearly.push({ time, count: info.count });
      }
    }
    return { full, nearly };
  }, [slotCounts]);

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
        .select("id, lead_name, lead_phone, closer_id, scheduled_date, scheduled_time, status, meet_link, observation, briefing, deleted_at, created_by, sdr_responsavel_id, created_at, meeting_reason, channel_type, briefing_read_at, briefing_read_by, original_agendamento_id, duration_minutes, is_5k")
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
      // Override "Atua como SDR" (configurável no /admin via profiles.is_sdr_override).
      // Trata esses usuários como SDR para fins de métricas/listas (Métricas SDRs,
      // Ranking, Produtividade, Erros). Fallback adicional por nome para casos
      // legados antes do flag ser propagado.
      const { data: profiles } = await supabase.rpc("get_public_profiles");
      (profiles ?? []).forEach((p: any) => {
        if (p.is_sdr_override === true || isSdrOverrideName(p.full_name)) {
          map.set(p.user_id, "sdr");
        }
      });
      return map;
    },
    // Lista de papéis muda raramente — evita refetches de minuto em minuto.
    staleTime: 30 * 60_000,
    gcTime: Infinity,
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
    // Mapa de nomes muda raramente; mantém em cache pela sessão.
    staleTime: 30 * 60_000,
    gcTime: Infinity,
  });

  // Realtime: ouve mudanças em agendamentos para TODOS os usuários (independente da função).
  // Channel name único por sessão evita colisões entre múltiplos clientes/abas.
  useEffect(() => {
    const channelName = `agendamentos-realtime-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-comercial-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-comercial-created"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-comercial-prev"] });
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

  const filtered = useMemo(() => {
    return agendamentos.filter((a) => {
      if (!a.closer_id || !selectedIds.has(a.closer_id)) return false;
      if (selectedSdrId !== "all") {
        const ownerSdr =
          a.sdr_responsavel_id ||
          (a.created_by && userRolesMap.get(a.created_by) === "sdr" ? a.created_by : null);
        if (ownerSdr !== selectedSdrId) return false;
      }
      return true;
    });
  }, [agendamentos, selectedIds, selectedSdrId, userRolesMap]);

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

  // Status válidos para o "Total" da barra superior
  const TOTAL_STATUSES = ["agendada", "confirmada", "realizada", "cancelada", "no_show", "reagendada"];

  // Helpers de classificação:
  // - SDR: agenda criada por usuário SDR OU agenda em que gestor/moderador apontou um SDR responsável.
  // - 2ª reunião: agenda criada por closer OU agenda marcada como 'segunda_reuniao' por gestor/moderador.
  const isSdrAgenda = (a: Agendamento) => {
    if (a.created_by && userRolesMap.get(a.created_by) === "sdr") return true;
    if (a.sdr_responsavel_id) return true;
    return false;
  };
  const isSecondMeetingAgenda = (a: Agendamento) => {
    if (a.created_by && userRolesMap.get(a.created_by) === "closer") return true;
    if (a.meeting_reason === "segunda_reuniao") return true;
    return false;
  };

  // Total SDRs (Admin/Mod/SDR view)
  const totalSdrCount = useMemo(
    () => filtered.filter((a) => TOTAL_STATUSES.includes(a.status) && isSdrAgenda(a)).length,

    [filtered, userRolesMap]
  );

  // Status counts SDR usando status efetivo
  const statusCounts = useMemo(
    () =>
      filtered.reduce<Record<string, number>>((acc, agendamento) => {
        if (!isSdrAgenda(agendamento)) return acc;
        const status = getEffectiveStatus(agendamento);
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      }, {}),
    [filtered, userRolesMap]
  );

  // Status counts de TODAS as agendas do dia (SDR + 2ª reunião)
  const allStatusCounts = useMemo(
    () =>
      filtered.reduce<Record<string, number>>((acc, agendamento) => {
        const status = getEffectiveStatus(agendamento);
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      }, {}),
    [filtered]
  );

  // Total Closers (= 2ª reunião) — inclui canceladas (alinhado a "Total agend. dia")
  const closerCreatedCount = useMemo(
    () => filtered.filter((a) => TOTAL_STATUSES.includes(a.status) && isSecondMeetingAgenda(a)).length,

    [filtered, userRolesMap]
  );

  // Closer Realizada (2ª reunião realizada)
  const closerRealizadaCount = useMemo(
    () => filtered.filter((a) => a.status === "realizada" && isSecondMeetingAgenda(a)).length,
    [filtered, userRolesMap]
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

  // ─── Métricas para CLOSER (visão individual da própria agenda) ───
  const closerOwnAgendamentos = useMemo(
    () => filtered.filter((a) => a.closer_id === myCloserId),
    [filtered, myCloserId]
  );
  const closerOwnTotal = useMemo(
    () => closerOwnAgendamentos.filter((a) => TOTAL_STATUSES.includes(a.status)).length,
    [closerOwnAgendamentos]
  );
  const closerOwnStatusCounts = useMemo(
    () =>
      closerOwnAgendamentos.reduce<Record<string, number>>((acc, a) => {
        const eff = getEffectiveStatus(a);
        acc[eff] = (acc[eff] ?? 0) + 1;
        return acc;
      }, {}),
    [closerOwnAgendamentos]
  );

  const canChangeStatus = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "moderador" || role === "supervisor") return true;
    if (role === "sdr") return detailAg.created_by === user?.id || (detailAg as any).sdr_responsavel_id === user?.id;
    if (role === "closer") return myCloserId !== null && detailAg.closer_id === myCloserId;
    return false;
  }, [detailAg, role, user?.id, myCloserId]);

  // Tipo do moderador (sdr | closer | null) — somente "Moderador de SDR" pode transferir agendas.
  const { data: moderadorTipo = null } = useQuery({
    queryKey: ["my-moderador-tipo", user?.id],
    enabled: !!user?.id && role === "moderador",
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("moderador_tipo")
        .eq("user_id", user!.id)
        .maybeSingle();
      return ((data as any)?.moderador_tipo as "sdr" | "closer" | null) ?? null;
    },
  });

  // Quem pode editar/transferir o Closer da reunião: gestor e supervisor sempre; moderador APENAS se for "Moderador de SDR".
  const canEditCloser = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "supervisor") return true;
    if (role === "moderador") return moderadorTipo === "sdr";
    return false;
  }, [detailAg, role, moderadorTipo]);

  // Quem pode editar o SDR responsável: gestor/moderador/supervisor ou SDR APENAS no agendamento que ele próprio criou.
  const canEditSdr = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "moderador" || role === "supervisor") return true;
    if (role === "sdr") return detailAg.created_by === user?.id;
    return false;
  }, [detailAg, role, user?.id]);

  // Quem pode TRANSFERIR o lead para outro closer:
  // - gestor / supervisor: sempre
  // - moderador: apenas "Moderador de SDR"
  // - closer: APENAS se for o dono atual do lead (nunca pode "puxar" lead de outro)
  const canTransfer = useMemo(() => {
    if (!detailAg) return false;
    if (role === "gestor" || role === "supervisor") return true;
    if (role === "moderador") return moderadorTipo === "sdr";
    if (role === "closer") return myCloserId !== null && detailAg.closer_id === myCloserId;
    return false;
  }, [detailAg, role, myCloserId, moderadorTipo]);

  const handleTransferLead = async () => {
    if (!detailAg || !transferTarget || transferTarget === detailAg.closer_id) return;
    setTransferring(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-transfer-event", {
        body: { agendamento_id: detailAg.id, new_closer_id: transferTarget },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Falha ao transferir lead");
      }
      const oldName = closerMap.get(detailAg.closer_id) || "—";
      const newName = closerMap.get(transferTarget) || "—";
      const newMeetLink = (data?.meet_link as string | null) ?? null;
      const warnings: string[] = data?.warnings ?? [];
      await logAudit("transfer_lead", "agendamento", detailAg.id, {
        lead_name: detailAg.lead_name,
        scheduled_date: detailAg.scheduled_date,
        scheduled_time: detailAg.scheduled_time,
        from_closer: oldName,
        to_closer: newName,
        meet_link_old: detailAg.meet_link ?? null,
        meet_link_new: newMeetLink,
        google_warnings: warnings,
      });
      patchAgendamentosCache(detailAg.id, (a) => ({ ...a, closer_id: transferTarget, meet_link: newMeetLink }));
      setDetailAg({ ...detailAg, closer_id: transferTarget, meet_link: newMeetLink });
      if (warnings.includes("new_closer_not_connected")) {
        toast.warning(`Lead transferido para ${newName}, mas o novo closer não tem Google Calendar conectado.`);
      } else if (warnings.includes("create_event_failed")) {
        toast.warning(`Lead transferido para ${newName}, mas falhou ao criar o evento no Google.`);
      } else {
        toast.success(`Lead transferido para ${newName}`);
      }
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      setTransferOpen(false);
      setTransferTarget("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao transferir lead");
    }
    setTransferring(false);
  };

  // Lista de usuários (qualquer função) para selecionar como responsável — ordem alfabética.
  // Usa RPC pública para manter Gestor/Moderador/Supervisor com a mesma visão de opções.
  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users-for-detail"],
    enabled: canEditSdr,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_profiles");
      return data ?? [];
    },
  });

  // Closers ativos para o dialog "Transferir lead" — independente do filtro do usuário
  // (closers role só veem o próprio no useCloserFilter, mas precisam ver TODOS os destinos possíveis aqui).
  const { data: transferableClosers = [] } = useQuery({
    queryKey: ["transferable-closers"],
    enabled: transferOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  const handleChangeCloser = async (newCloserId: string) => {
    if (!detailAg || newCloserId === detailAg.closer_id) return;
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ closer_id: newCloserId } as any)
        .eq("id", detailAg.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para alterar o closer deste agendamento.");
      }
      const oldName = closerMap.get(detailAg.closer_id) || "—";
      const newName = closerMap.get(newCloserId) || "—";
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change.
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
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ sdr_responsavel_id: newSdrId } as any)
        .eq("id", detailAg.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para alterar o responsável deste agendamento.");
      }
      const oldName = currentSdr ? (profilesMap.get(currentSdr) || "—") : "—";
      const newName = profilesMap.get(newSdrId) || "—";
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change.
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
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, deletion_reason: deleteReason.trim() })
        .eq("id", deleteTarget.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para excluir este agendamento.");
      }
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change (action=delete_agendamento, inclui deletion_reason).
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
  const handleStatusChange = async (newStatus: string, cancellationReason?: string) => {
    if (!detailAg) return;
    // Realizada → abre pop-up de Vendeu? (bloqueia submit até preencher)
    if (newStatus === "realizada") {
      setVendaDialogAg(detailAg);
      return;
    }
    // Cancelada → exige motivo (1 linha)
    if (newStatus === "cancelada" && !cancellationReason) {
      setCancelReasonOpen(true);
      return;
    }
    setUpdatingStatus(true);
    try {
      const patch: any = { status: newStatus };
      if (newStatus === "cancelada" && cancellationReason) patch.cancellation_reason = cancellationReason;
      const { data, error } = await supabase
        .from("agendamentos")
        .update(patch)
        .eq("id", detailAg.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para alterar o status deste agendamento.");
      }
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change (action=update_status).
      toast.success(`Status alterado para ${STATUS_LABELS[newStatus]}`);
      const updatedAg = { ...detailAg, status: newStatus };
      patchAgendamentosCache(detailAg.id, (agendamento) => ({ ...agendamento, status: newStatus }));
      setDetailAg(updatedAg);
      await queryClient.refetchQueries({ queryKey: ["agendamentos", detailAg.scheduled_date], exact: true });
      if (newStatus === "cancelada" || newStatus === "no_show") {
        setDetailAg(null);
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

  // Handle edit save — same day, novo horário.
  // Edição de horário NÃO conta como reagendamento (mesmo dia → não afeta
  // "Não comparecimento"). Porém o agendamento volta para "Aguardando atribuição":
  // o closer_id é zerado para que o gestor reavalie a alocação. O webhook do
  // CRM será disparado como "Agendado" quando o novo closer for atribuído.
  const handleEditSave = async () => {
    if (!detailAg || !editTime) return;

    if (editTime === detailAg.scheduled_time) {
      setEditMode(false);
      return;
    }

    setSavingEdit(true);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ scheduled_time: editTime, closer_id: null } as any)
        .eq("id", detailAg.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para editar este agendamento.");
      }
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change.
      toast.success("Horário atualizado. Agendamento enviado para Aguardando atribuição.");
      setDetailAg(null);
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["pending-assignments"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar horário");
    }
    setSavingEdit(false);
  };

  // Reagendar: cria nova agenda em outra data/horário, sem closer (vai para
  // "Aguardando atribuição"). A trigger `detect_and_mark_reschedule` marca a
  // original como `reagendada` (via original_agendamento_id), disparando o
  // webhook "Reagendada" para a original. A nova só dispara webhook ("Agendado")
  // quando o gestor atribuir o Closer.
  const handleReschedule = async () => {
    if (!detailAg || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    try {
      const newDateStr = `${rescheduleDate.getFullYear()}-${String(rescheduleDate.getMonth() + 1).padStart(2, "0")}-${String(rescheduleDate.getDate()).padStart(2, "0")}`;
      const sdrId = (detailAg as any).sdr_responsavel_id || detailAg.created_by;
      const { error } = await supabase.from("agendamentos").insert({
        lead_name: detailAg.lead_name,
        lead_phone: detailAg.lead_phone,
        scheduled_date: newDateStr,
        scheduled_time: rescheduleTime,
        status: "agendada",
        closer_id: null,
        original_agendamento_id: detailAg.id,
        briefing: detailAg.briefing,
        meeting_reason: detailAg.meeting_reason,
        channel_type: detailAg.channel_type,
        duration_minutes: detailAg.duration_minutes,
        sdr_responsavel_id: sdrId,
        created_by: user?.id,
      } as any);
      if (error) throw error;
      toast.success("Reagendamento criado. Reunião enviada para Aguardando atribuição.");
      setRescheduleOpen(false);
      setRescheduleDate(null);
      setRescheduleTime(null);
      setDetailAg(null);
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["pending-assignments"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao reagendar");
    }
    setRescheduling(false);
  };


  return (
    <>
      <div className="animate-fade-in space-y-4">
        

        {/* Status counters */}
        {!loadingAgendamentos && (() => {
          // Visão de Closer (individual): mostra apenas seus próprios números, sem "Total Closers"
          const isCloserView = role === "closer";
          const sourceCounts = isCloserView ? closerOwnStatusCounts : allStatusCounts;
          const sourceAgendamentos = isCloserView ? closerOwnAgendamentos : filtered;
          const sourceTotalReal = sourceCounts["realizada"] ?? 0;
          const totalLabel = isCloserView ? "Total Closer" : "Total real. dia";

          // Total agend. dia = todas as agendas SDR + Closer (inclui canceladas)
          const totalAgend = isCloserView
            ? sourceAgendamentos.filter(a => TOTAL_STATUSES.includes(a.status)).length
            : totalSdrCount + closerCreatedCount;


          // Ainda a real. dia: agendada + confirmada (sem filtro de horário)
          const aindaReal = (sourceCounts["agendada"] ?? 0) + (sourceCounts["confirmada"] ?? 0);

          const cards = [
            { key: "total_agend", label: "Total agend. dia", icon: CalendarDays, color: "text-sky-300", bg: "bg-sky-500/10" },
            
            { key: "ainda_real", label: "Ainda a real. dia", icon: Hourglass, color: "text-amber-300", bg: "bg-amber-500/10" },
            { key: "agendada", label: "Sem confirmar", icon: Clock, color: "text-blue-300", bg: "bg-blue-500/10" },
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
          ];

          return (
            <div className={cn(
              "grid grid-cols-2 sm:grid-cols-4 gap-3",
              isCloserView ? "xl:grid-cols-9" : "xl:grid-cols-11"
            )}>
              {cards.map(({ key, label, icon: Icon, color, bg }) => {
                let count: number;
                if (key === "total") count = sourceTotalReal;
                else if (key === "total_agend") count = totalAgend;
                else if (key === "ainda_real") count = aindaReal;
                else if (key === "nao_comparecimento") {
                  count =
                    (sourceCounts["cancelada"] ?? 0) +
                    (sourceCounts["no_show"] ?? 0) +
                    (sourceCounts["reagendada"] ?? 0);
                } else if (key === "reagendada") {
                  // Conta tanto originais com status='reagendada' quanto agendas novas
                  // com original_agendamento_id (detecção automática preserva status da original).
                  const ids = new Set<string>();
                  sourceAgendamentos.forEach((a) => {
                    if (a.status === "reagendada" || (a as any).original_agendamento_id) ids.add(a.id);
                  });
                  count = ids.size;
                } else {
                  count = sourceCounts[key] ?? 0;
                }
                return (
                  <div key={key} className={cn("rounded-xl border border-primary/10 p-2 flex flex-col items-center justify-center text-center gap-1 min-w-0", bg)}>
                    <Icon className={cn("h-4 w-4 shrink-0", color)} />
                    <p className="text-lg font-bold leading-none">{count}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  </div>
                );
              })}
              {/* Total Closers + Closer Realizada — apenas para Admin / Moderador / SDR */}
              {!isCloserView && (
                <>
                  <div className={cn("rounded-xl border border-primary/10 p-2 flex flex-col items-center justify-center text-center gap-1 min-w-0 bg-purple-500/10")}>
                    <Users className={cn("h-4 w-4 shrink-0 text-purple-400")} />
                    <p className="text-lg font-bold leading-none">{closerCreatedCount}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">Total Closers</p>
                  </div>
                  <div className={cn("rounded-xl border border-primary/10 p-2 flex flex-col items-center justify-center text-center gap-1 min-w-0 bg-emerald-500/10")}>
                    <CheckCircle2 className={cn("h-4 w-4 shrink-0 text-emerald-400")} />
                    <p className="text-lg font-bold leading-none">{closerRealizadaCount}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">Closer Realizada</p>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Faixa de aviso: horários lotados / quase lotados (todos closers somados) */}
        {role !== "closer" && (slotAlerts.full.length > 0 || slotAlerts.nearly.length > 0) && (
          <div className="space-y-2">
            {slotAlerts.full.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-red-500/60 bg-red-500/15 px-3 py-2.5 text-sm">
                <Users className="h-4 w-4 shrink-0 text-red-500" />
                <span className="font-semibold text-red-600 dark:text-red-400">
                  Não ofereça ao lead — lotado:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {slotAlerts.full.map((s) => (
                    <span key={s.time} className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                      {s.time}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {slotAlerts.nearly.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Quase lotado — evite oferecer:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {slotAlerts.nearly.map((s) => (
                    <span key={s.time} className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      {s.time}
                    </span>
                  ))}
                </div>
              </div>
            )}
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

        {/* SDR filter — só para gestor/moderador analisarem distribuição por SDR */}
        {isAdminLike && sdrUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground shrink-0">SDR:</span>
            <Select value={selectedSdrId} onValueChange={setSelectedSdrId}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="Todos os SDRs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os SDRs</SelectItem>
                {sdrUsers.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSdrId !== "all" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setSelectedSdrId("all")}
              >
                Limpar
              </Button>
            )}
          </div>
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
            userRolesMap={userRolesMap}
            onDelete={role === "gestor" || role === "moderador" || role === "supervisor" || role === "sdr" ? setDeleteTarget : undefined}
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
                  {(() => {
                    const eff = getEffectiveStatus(detailAg);
                    return (
                      <Badge variant="outline" className={cn("text-xs", STATUS_BADGE_COLORS[eff])}>
                        {STATUS_LABELS[eff] || eff}
                      </Badge>
                    );
                  })()}
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
                  {detailAg.is_5k && (
                    <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-500 border-amber-500/40 font-bold">
                      Projeto 5K
                    </Badge>
                  )}
                  {((detailAg.created_by && userRolesMap.get(detailAg.created_by) === "closer") || detailAg.meeting_reason === "segunda_reuniao") && (
                    <Badge variant="outline" className="text-xs bg-sky-500/20 text-sky-400 border-sky-500/40 font-bold">
                      2ª Reunião
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

              {/* Justificativa do closer (reagendamento) — abre dialog dedicado */}
              {detailAg.observation && detailAg.observation.trim().length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs w-full border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                  onClick={() => setViewJustification(true)}
                >
                  <FileText className="h-3.5 w-3.5" />Ver justificativa
                </Button>
              )}

              {/* Edit button — controlado pela permissão "edit_appointment_time" */}
              {canEditTime && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" />Editar horário
                </Button>
              )}

              {/* Botão "Reagendar" foi movido para a seção "Alterar status"
                  abaixo, junto de Confirmar / Realizada / Cancelar / No-show. */}


              {/* Botão "Transferir lead para outro closer" escondido por solicitação.
                  Lógica de transferência preservada (handleTransferLead + dialog). */}


              {/* Registrar venda — gestor/moderador podem registrar/atualizar venda
                  mesmo quando o closer já marcou como realizada sem preencher. */}
              {(role === "gestor" || role === "moderador" || role === "supervisor") && detailAg.status === "realizada" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs w-full border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                  onClick={() => setVendaDialogAg(detailAg)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />Registrar / atualizar venda
                </Button>
              )}

              {canChangeStatus && (() => {
                // SDR só pode operar em reagendadas se ele mesmo criou o reagendamento.
                const sdrIsOwnerOfReschedule =
                  role === "sdr" &&
                  (detailAg.sdr_responsavel_id === user?.id || detailAg.created_by === user?.id);
                const sdrBlocked =
                  detailAg.status === "reagendada" && role === "sdr" && !sdrIsOwnerOfReschedule;
                return (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium">Alterar status</p>
                  {/* Closers mantêm acesso total a Realizada/Reagendar mesmo em
                      reagendamentos. SDRs ficam bloqueados em reagendada quando
                      NÃO foram os criadores do reagendamento. */}
                  {sdrBlocked ? (
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
                        {/* Confirmar — disponível para SDR/Gestor/Mod quando status é "agendada"
                            (lead aguardando confirmação). Closer não vê o botão Confirmar. */}
                        {role !== "closer" && detailAg.status !== "confirmada" && detailAg.status !== "reagendada" && detailAg.status !== "realizada" && (
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10" disabled={updatingStatus} onClick={() => handleStatusChange("confirmada")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />Confirmar
                          </Button>
                        )}
                        {role !== "sdr" && detailAg.status !== "realizada" && (
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" disabled={updatingStatus} onClick={() => handleStatusChange("realizada")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />Realizada
                          </Button>
                        )}
                        {/* Reagendar — abre dialog dedicado (cria nova agenda
                            em outro dia/horário, original vira "Reagendada"). */}
                        {detailAg.status !== "reagendada" && detailAg.status !== "realizada" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs border-purple-500/30 text-purple-500 hover:bg-purple-500/10"
                            disabled={updatingStatus}
                            onClick={() => {
                              setRescheduleDate(null);
                              setRescheduleTime(null);
                              setRescheduleOpen(true);
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />Reagendar
                          </Button>
                        )}

                        {/* Cancelar e No-show:
                            - SDR: vê quando é o criador do agendamento (sdr_responsavel_id ou created_by = user.id)
                            - Closer: vê apenas se for o criador (created_by = user.id)
                            - Gestor / Moderador: sempre veem */}
                        {(() => {
                          const isOwnerSDR =
                            role === "sdr" &&
                            (detailAg.sdr_responsavel_id === user?.id ||
                              detailAg.created_by === user?.id);
                          const canSeeCancelNoShow =
                            role === "gestor" ||
                            role === "moderador" ||
                            role === "supervisor" ||
                            isOwnerSDR ||
                            (role === "closer" && detailAg.created_by === user?.id);
                          if (!canSeeCancelNoShow) return null;
                          return (
                            <>
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
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
                );
              })()}
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
                  {transferableClosers
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

      {/* Reagendar dialog — cria nova agenda em outra data/horário.
          A original vira "Reagendada" via trigger; a nova nasce sem closer e
          entra em "Aguardando atribuição". */}
      <Dialog
        open={rescheduleOpen}
        onOpenChange={(o) => {
          if (!o) {
            setRescheduleOpen(false);
            setRescheduleDate(null);
            setRescheduleTime(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Reagendar reunião
            </DialogTitle>
            <DialogDescription>
              Escolha a nova data e horário para <strong>{detailAg?.lead_name}</strong>.
              O agendamento original será marcado como <strong>Reagendada</strong> e a
              nova reunião entrará em <strong>Aguardando atribuição</strong> para o
              gestor reavaliar o Closer. Canal e duração são herdados do original.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Nova data</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {rescheduleDate ? format(rescheduleDate, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={rescheduleDate ?? undefined}
                    onSelect={(d) => {
                      if (d) {
                        setRescheduleDate(d);
                        setRescheduleTime(null);
                      }
                    }}
                    locale={ptBR}
                    disabled={(d) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return d < today;
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {rescheduleDate && detailAg && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Novo horário</label>
                <EditTimeSlots
                  closerId={detailAg.closer_id}
                  date={rescheduleDate}
                  selectedTime={rescheduleTime}
                  onSelect={setRescheduleTime}
                  currentAgId={detailAg.id}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={!rescheduleDate || !rescheduleTime || rescheduling}
            >
              {rescheduling ? "Reagendando..." : "Confirmar reagendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Justificativa do reagendamento (closer) — janela dedicada similar ao briefing */}
      <Dialog open={viewJustification} onOpenChange={setViewJustification}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-500" />
              Justificativa do reagendamento
            </DialogTitle>
            <DialogDescription>
              {detailAg?.lead_name && (
                <span>
                  Reunião com <strong>{detailAg.lead_name}</strong>
                  {detailAg && ` · ${format(new Date(detailAg.scheduled_date + "T12:00:00"), "dd/MM/yyyy")} às ${detailAg.scheduled_time}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 whitespace-pre-wrap break-words" style={{ overflowWrap: "anywhere" }}>
            {detailAg?.observation || "—"}
          </div>
        </DialogContent>
      </Dialog>

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

      <CancelReasonDialog
        open={cancelReasonOpen}
        onOpenChange={setCancelReasonOpen}
        leadName={detailAg?.lead_name}
        loading={updatingStatus}
        onConfirm={async (reason) => {
          setCancelReasonOpen(false);
          await handleStatusChange("cancelada", reason);
        }}
      />
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
  userRolesMap,
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
  userRolesMap: Map<string, string>;
  onDelete?: (target: DeleteTarget) => void;
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
  // Cards começam no slot do horário inicial e ocupam visualmente todas as
  // horas cobertas pelo `duration_minutes` (mínimo 60).
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

  // Slots que estão "cobertos" por um agendamento de duração > 60min
  // (mas não são o slot inicial). Estes não devem renderizar célula própria.
  const coveredSet = useMemo(() => {
    const s = new Set<string>();
    agendamentos.forEach((a) => {
      const startHour = parseInt(a.scheduled_time.slice(0, 2), 10);
      const dur = a.duration_minutes ?? 60;
      const span = Math.max(1, Math.ceil(dur / 60));
      for (let i = 1; i < span; i++) {
        s.add(`${a.closer_id}-${String(startHour + i).padStart(2, "0")}`);
      }
    });
    return s;
  }, [agendamentos]);

  // Span (em linhas do grid) máximo do slot inicial — usa o maior agendamento
  const slotSpanMap = useMemo(() => {
    const m = new Map<string, number>();
    agendamentos.forEach((a) => {
      const hourPrefix = a.scheduled_time.slice(0, 2);
      const key = `${a.closer_id}-${hourPrefix}`;
      const dur = a.duration_minutes ?? 60;
      const span = Math.max(1, Math.ceil(dur / 60));
      m.set(key, Math.max(m.get(key) ?? 1, span));
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [colWidth, setColWidth] = useState<number>(160);

  const TIME_COL = 60;
  const MIN_COL = 150;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let rafId = 0;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const available = el.clientWidth - TIME_COL;
        if (available <= 0) return;
        const fit = Math.max(1, Math.min(closers.length, Math.floor(available / MIN_COL)));
        const newWidth = Math.max(MIN_COL, available / fit);
        setColWidth((prev) => (Math.abs(prev - newWidth) > 0.5 ? newWidth : prev));
        setCanScrollLeft(el.scrollLeft > 2);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [closers.length]);

  const scrollByCol = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * colWidth, behavior: "smooth" });
  };

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByCol(-1)}
          aria-label="Coluna anterior"
          className="absolute -left-5 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-black/80 border-2 border-white text-white shadow-xl flex items-center justify-center hover:bg-primary/10 transition-colors"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByCol(1)}
          aria-label="Próxima coluna"
          className="absolute -right-5 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-black/80 border-2 border-white text-white shadow-xl flex items-center justify-center hover:bg-primary/10 transition-colors"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}
      <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-primary/10 bg-card">
        <div
          className="grid"
          style={{ gridTemplateColumns: `${TIME_COL}px repeat(${closers.length}, ${colWidth}px)` }}
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
                const slotKey = `${c.id}-${hourPrefix}`;
                const isCovered = coveredSet.has(slotKey);
                const agList = isCovered ? [] : (slotMap.get(slotKey) || []);
                const busy = busyMap.get(slotKey) ?? null;
                const block = blockMap.get(slotKey) ?? null;
                const idx = closerIndexMap.get(c.id) ?? 0;
                const closerColor = getCloserColor(c.id, idx);
                const span = slotSpanMap.get(slotKey) ?? 1;
                const canClickToSchedule = !busy && !block && !isCovered;

                return (
                  <div
                    key={`${c.id}-${hour}`}
                    className={cn(
                      "relative border-b border-l border-primary/5 px-1.5 py-1.5 min-h-[72px]",
                      canClickToSchedule && "cursor-pointer hover:bg-primary/5 transition-colors",
                      span > 1 && "z-10"
                    )}
                    onClick={() => {
                      if (canClickToSchedule) {
                        onClickEmptySlot(c.id, hour);
                      }
                    }}
                    title={canClickToSchedule ? `Agendar às ${hour} com ${c.name}` : undefined}
                  >
                    {agList.length > 0 && (
                      <div
                        className="flex gap-0.5 overflow-hidden absolute left-1.5 right-1.5 top-1.5"
                        style={{ height: `${span * 72 + (span - 1)}px` }}
                      >
                        {block && (
                          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-1 text-[11px] flex-1 min-w-0 overflow-hidden space-y-0.5">
                            <div className="flex items-center gap-1">
                              <CalendarOff className="h-3 w-3 text-amber-400 shrink-0" />
                              <span className="text-amber-400 font-medium truncate">{BLOCK_TYPE_LABELS[block.block_type] || block.block_type}</span>
                            </div>
                            {block.description && (
                              <p className="text-[10px] text-muted-foreground truncate">{block.description}</p>
                            )}
                            <p className="text-[9px] text-muted-foreground truncate">{block.start_time}–{block.end_time}</p>
                          </div>
                        )}
                        {!block && busy && (
                          <div className="rounded-md border border-muted-foreground/20 bg-muted/50 px-1.5 py-1 text-[11px] flex-1 min-w-0 overflow-hidden flex items-center gap-1">
                            <Ban className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-medium truncate">Ocupado</span>
                          </div>
                        )}
                        {agList.map((ag) => {
                          const effStatus = getEffectiveStatus(ag);
                          const isCancelled = CANCELLED_STATUSES.includes(effStatus);
                          const extraTiles = (block ? 1 : (busy ? 1 : 0));
                          const isCompact = (agList.length + extraTiles) >= 3;
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
                              title={`${ag.lead_name} — ${ag.scheduled_time} — ${STATUS_LABELS[effStatus] || effStatus}${ag.meeting_reason ? ` — ${ag.meeting_reason}` : ''}`}
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
                              {(() => {
                                const isCloserBooked = (ag.created_by ? userRolesMap.get(ag.created_by) === "closer" : false) || ag.meeting_reason === "segunda_reuniao";
                                if (!ag.is_5k && !isCloserBooked) return null;
                                return (
                                  <div className="absolute top-0 left-0 flex gap-0.5">
                                    {ag.is_5k && (
                                      <span className={cn(
                                        "rounded-br-md rounded-tl-md px-1.5 py-0.5 font-bold leading-none bg-amber-500/90 text-white",
                                        isCompact ? "text-[8px]" : "text-[10px]"
                                      )}>
                                        5K
                                      </span>
                                    )}
                                    {isCloserBooked && (
                                      <span className={cn(
                                        "px-1.5 py-0.5 font-bold leading-none bg-sky-500/90 text-white",
                                        !ag.is_5k && "rounded-tl-md",
                                        "rounded-br-md",
                                        isCompact ? "text-[8px]" : "text-[10px]"
                                      )} title="Reunião marcada por Closer (2ª reunião)">
                                        2ª
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              <div className={cn("font-semibold truncate pr-5", (ag.is_5k || (ag.created_by && userRolesMap.get(ag.created_by) === "closer") || ag.meeting_reason === "segunda_reuniao") && "pl-8", isCancelled && "line-through", isCompact && "text-[11px]")}>
                                {ag.lead_name}
                              </div>

                              <div className="flex items-center gap-1 text-[11px] opacity-80">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className={cn("truncate", isCancelled && "line-through")}>{(() => {
                                  const dur = ag.duration_minutes ?? 60;
                                  if (dur <= 60) return ag.scheduled_time;
                                  const [hh, mm] = ag.scheduled_time.split(":").map(Number);
                                  const endTotal = hh * 60 + mm + dur;
                                  const eh = String(Math.floor(endTotal / 60) % 24).padStart(2, "0");
                                  const em = String(endTotal % 60).padStart(2, "0");
                                  return `${ag.scheduled_time}–${eh}:${em}`;
                                })()}</span>
                                {!isCompact && ag.meet_link && (
                                  <a href={ag.meet_link} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Video className="h-2.5 w-2.5" />
                                  </a>
                                )}
                                {onDelete && (
                                  <button
                                    className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive p-0.5 -m-0.5 rounded"
                                    onClick={(e) => { e.stopPropagation(); onDelete({ id: ag.id, lead_name: ag.lead_name, closer_id: ag.closer_id, scheduled_date: ag.scheduled_date, scheduled_time: ag.scheduled_time }); }}
                                    title="Excluir agendamento"
                                  >
                                    <Trash2 className={cn(isCompact ? "h-3 w-3" : "h-4 w-4")} />
                                  </button>
                                )}
                              </div>
                              {/* Status badges - compact: single line truncated */}
                              <div className={cn("flex gap-0.5 overflow-hidden", isCompact ? "flex-nowrap" : "flex-wrap")}>
                                <span className={cn(
                                  "rounded px-1 py-0.5 font-medium uppercase tracking-wider whitespace-nowrap shrink-0",
                                  isCompact ? "text-[8px]" : "text-[9px]",
                                  STATUS_BADGE_COLORS[effStatus]
                                )}>
                                  {STATUS_LABELS[effStatus] || effStatus}
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
                    {block && agList.length === 0 && (
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
