import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, Search, X, CalendarDays, Filter, Download, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Eye, Users, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/services/auditLog";
import { isSdrOverrideName } from "@/lib/sdrOverrides";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { useDeletionReasons } from "@/hooks/useDeletionReasons";
import { useSdrGlobalVisibility } from "@/hooks/useSdrGlobalVisibility";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  agendada: { label: "Agendado", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  confirmada: { label: "Confirmada", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  realizada: { label: "Realizada", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cancelada: { label: "Cancelada", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  reagendada: { label: "Reagendada", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  no_show: { label: "No-show", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
};


const CHANNEL_TYPES = ["CTA", "Tráfego Pago", "Reativação", "Social Selling", "Renovação", "Indicação", "Formulário Bio"];
const PAGE_SIZE = 20;

// Normalize a UTC timestamp to a Brasília (BRT) yyyy-MM-dd date string.
const brDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const brDateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const localDateOf = (iso: string): string => brDateFmt.format(new Date(iso));
const formatBR = (iso: string): string => brDateTimeFmt.format(new Date(iso)).replace(",", "");

export default function ReunioesListPage() {
  const { user, role, isGestor, isModerador, isSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const isCloser = role === "closer";
  const isSDR = role === "sdr";
  const canDelete = isGestor || isModerador || isSupervisor || isSDR;
  const canSeeAllPeers = isGestor || isModerador || isSupervisor;
  const canTransferCloser = isGestor || isModerador || isSupervisor;
  const { data: deletionReasons = [] } = useDeletionReasons();
  const isAdminLike = isGestor || isModerador || isSupervisor;
  const visibleReasons = useMemo(
    () => deletionReasons.filter((r) => !r.restricted || isAdminLike),
    [deletionReasons, isAdminLike]
  );
  const {
    enabled: sdrGlobalVisibility,
    userIds: sdrGlobalVisibilityUserIds,
    hasGlobalVisibility: sdrHasGlobalVisibility,
    save: saveSdrGlobalVisibility,
    saveUsers: saveSdrGlobalVisibilityUsers,
    isSaving: savingSdrGlobalVisibility,
  } = useSdrGlobalVisibility();

  const [filterCloser, setFilterCloser] = useState<string>("all");
  const [filterSDR, setFilterSDR] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const [filterMeetingDateFrom, setFilterMeetingDateFrom] = useState<Date | undefined>();
  const [filterMeetingDateTo, setFilterMeetingDateTo] = useState<Date | undefined>();
  const [filterCreatedDateFrom, setFilterCreatedDateFrom] = useState<Date | undefined>();
  const [filterCreatedDateTo, setFilterCreatedDateTo] = useState<Date | undefined>();
  const [searchText, setSearchText] = useState("");
  const [filterChannelType, setFilterChannelType] = useState<string>("all");
  const [excludeWithSale, setExcludeWithSale] = useState(false);
  const [onlyWithSale, setOnlyWithSale] = useState(false);
  const [onlyWithOffer, setOnlyWithOffer] = useState(false);
  const [filterOfferProduct, setFilterOfferProduct] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  type SortKey = "lead_name" | "closer" | "sdr" | "datetime" | "created_at" | "status" | "meeting_reason" | "channel_type";
  const [sortKey, setSortKey] = useState<SortKey>("datetime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Detail dialog state
  const [detailTarget, setDetailTarget] = useState<any | null>(null);
  const { data: detailVenda } = useQuery({
    queryKey: ["reuniao-venda", detailTarget?.id],
    enabled: !!detailTarget?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("resumo_venda, explicacao_nao_fechamento, vendeu, valor, produto")
        .eq("agendamento_id", detailTarget!.id)
        .maybeSingle();
      return data;

    },
  });

  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name, email").eq("active", true).order("name");
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email, is_sdr_override").eq("active", true).order("full_name");
      return data || [];
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles-list"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id, role");
      return data || [];
    },
  });

  // Janela server-side: por padrão, últimos 180 dias. Quando o usuário escolhe
  // uma data inicial mais antiga, a janela é estendida para cobrir o filtro.
  const meetingWindowStart = useMemo(() => {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 180);
    if (filterMeetingDateFrom && filterMeetingDateFrom < defaultStart) {
      return format(filterMeetingDateFrom, "yyyy-MM-dd");
    }
    return format(defaultStart, "yyyy-MM-dd");
  }, [filterMeetingDateFrom]);

  const { data: agendamentos = [], isLoading } = useQuery({
    queryKey: ["reunioes-list", meetingWindowStart],
    queryFn: async () => {
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      // Pagina até esgotar (Supabase limita 1000 por request), mas restringe
      // por janela de datas server-side para não trazer histórico completo.
      while (true) {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id, lead_name, lead_phone, closer_id, scheduled_date, scheduled_time, status, meet_link, observation, briefing, deleted_at, created_by, sdr_responsavel_id, created_at, meeting_reason, channel_type, original_agendamento_id, duration_minutes, is_5k, is_venda_avulsa")
          .is("deleted_at", null)
          .gte("scheduled_date", meetingWindowStart)
          .order("scheduled_date", { ascending: false })
          .order("scheduled_time", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // Set de agendamento_ids com venda fechada (vendeu = true)
  const { data: vendaAgendamentoIds = new Set<string>() } = useQuery({
    queryKey: ["vendas-agendamento-ids"],
    queryFn: async () => {
      const { data } = await supabase.from("vendas").select("agendamento_id").eq("vendeu", true);
      return new Set<string>((data || []).map((v: any) => v.agendamento_id).filter(Boolean));
    },
  });

  // Map de agendamento_id -> { vendeu, valor, produto } para filtros de oferta
  const { data: vendaOfertaMap = new Map<string, { vendeu: boolean; valor: number | null; produto: string | null }>() } = useQuery({
    queryKey: ["vendas-oferta-map"],
    queryFn: async () => {
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("vendas")
          .select("agendamento_id, vendeu, valor, produto")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      const m = new Map<string, { vendeu: boolean; valor: number | null; produto: string | null }>();
      all.forEach((v: any) => {
        if (v.agendamento_id) m.set(v.agendamento_id, { vendeu: !!v.vendeu, valor: v.valor, produto: v.produto ?? null });
      });
      return m;
    },
  });

  // Lista canônica de produtos (app_settings) + fallback dos produtos já ofertados
  const { items: produtosCadastrados } = useAppSettingList(APP_SETTING_KEYS.produtos, []);
  const offeredProducts = useMemo(() => {
    const s = new Set<string>(produtosCadastrados.map((p) => p.trim()).filter(Boolean));
    vendaOfertaMap.forEach((v) => {
      const hasOffer = v.vendeu || (typeof v.valor === "number" && (v.valor || 0) > 0);
      if (hasOffer && v.produto && v.produto.trim()) s.add(v.produto.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vendaOfertaMap, produtosCadastrados]);


  const closerMap = useMemo(() => {
    const m: Record<string, string> = {};
    closers.forEach((c) => (m[c.id] = c.name));
    return m;
  }, [closers]);

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => (m[p.user_id] = p.full_name));
    return m;
  }, [profiles]);

  // Role map to filter closers and SDRs properly
  const roleMap = useMemo(() => {
    const m: Record<string, string> = {};
    userRoles.forEach((r: any) => (m[r.user_id] = r.role));
    return m;
  }, [userRoles]);

  // Find current user's closer_id (for closer role)
  const myCloserId = useMemo(() => {
    if (!isCloser || !user) return null;
    const myProfile = profiles.find((p) => p.user_id === user.id);
    if (!myProfile) return null;
    const myCloser = closers.find((c) => c.email === myProfile.email);
    return myCloser?.id || null;
  }, [isCloser, user, profiles, closers]);

  // Only profiles with SDR role for SDR filter
  const sdrProfiles = useMemo(
    () => profiles.filter((p: any) => roleMap[p.user_id] === "sdr" || p.is_sdr_override === true || isSdrOverrideName(p.full_name)),
    [profiles, roleMap],
  );

  // Helper: resolve effective SDR for an agendamento
  const sdrIdOf = (ag: any): string | null => ag.sdr_responsavel_id || ag.created_by || null;

  // Determine if a row belongs to the current user
  const isOwnRow = (ag: any) => {
    if (isCloser && myCloserId) return ag.closer_id === myCloserId;
    if (isSDR && user) return sdrIdOf(ag) === user.id;
    return true;
  };

  const filtered = useMemo(() => {
    return agendamentos.filter((ag) => {
      // Role-based mandatory filter: Closer sees only own meetings, SDR sees only own assigned
      if (isCloser && myCloserId && ag.closer_id !== myCloserId) return false;
      if (isSDR && user && !sdrHasGlobalVisibility(user.id) && sdrIdOf(ag) !== user.id) return false;

      if (filterCloser !== "all" && ag.closer_id !== filterCloser) return false;
      if (filterSDR !== "all" && sdrIdOf(ag) !== filterSDR) return false;
      if (filterStatus !== "all" && ag.status !== filterStatus) return false;
      if (filterChannelType !== "all" && (ag as any).channel_type !== filterChannelType) return false;
      if (filterMeetingDateFrom && ag.scheduled_date < format(filterMeetingDateFrom, "yyyy-MM-dd")) return false;
      if (filterMeetingDateTo && ag.scheduled_date > format(filterMeetingDateTo, "yyyy-MM-dd")) return false;
      if (filterCreatedDateFrom) {
        const createdDate = localDateOf(ag.created_at);
        if (createdDate < format(filterCreatedDateFrom, "yyyy-MM-dd")) return false;
      }
      if (filterCreatedDateTo) {
        const createdDate = localDateOf(ag.created_at);
        if (createdDate > format(filterCreatedDateTo, "yyyy-MM-dd")) return false;
      }
      if (searchText) {
        const s = searchText.toLowerCase();
        if (!ag.lead_name.toLowerCase().includes(s) && !ag.lead_phone.includes(s)) return false;
      }
      if (excludeWithSale && vendaAgendamentoIds.has(ag.id)) return false;
      if (onlyWithSale && !vendaAgendamentoIds.has(ag.id)) return false;
      if (onlyWithOffer) {
        const v = vendaOfertaMap.get(ag.id);
        const hasOffer = !!v && (v.vendeu || (typeof v.valor === "number" && (v.valor || 0) > 0));
        if (!hasOffer) return false;
      }
      if (filterOfferProduct !== "all") {
        const v = vendaOfertaMap.get(ag.id);
        const hasOffer = !!v && (v.vendeu || (typeof v.valor === "number" && (v.valor || 0) > 0));
        if (!hasOffer) return false;
        if ((v!.produto || "").trim() !== filterOfferProduct) return false;
      }
      return true;
    });
  }, [agendamentos, filterCloser, filterSDR, filterStatus, filterChannelType, filterMeetingDateFrom, filterMeetingDateTo, filterCreatedDateFrom, filterCreatedDateTo, searchText, isCloser, myCloserId, isSDR, user, excludeWithSale, onlyWithSale, onlyWithOffer, filterOfferProduct, vendaAgendamentoIds, vendaOfertaMap, sdrGlobalVisibility, sdrGlobalVisibilityUserIds]);

  // Apply sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "lead_name": av = a.lead_name.toLowerCase(); bv = b.lead_name.toLowerCase(); break;
        case "closer": av = (closerMap[a.closer_id] || "").toLowerCase(); bv = (closerMap[b.closer_id] || "").toLowerCase(); break;
        case "sdr": av = (sdrIdOf(a) ? (profileMap[sdrIdOf(a)!] || "") : "").toLowerCase(); bv = (sdrIdOf(b) ? (profileMap[sdrIdOf(b)!] || "") : "").toLowerCase(); break;
        case "datetime": av = `${a.scheduled_date}T${a.scheduled_time}`; bv = `${b.scheduled_date}T${b.scheduled_time}`; break;
        case "created_at": av = a.created_at; bv = b.created_at; break;
        case "status": av = a.status; bv = b.status; break;
        case "meeting_reason": av = (a.meeting_reason || "").toLowerCase(); bv = (b.meeting_reason || "").toLowerCase(); break;
        case "channel_type": av = ((a as any).channel_type || "").toLowerCase(); bv = ((b as any).channel_type || "").toLowerCase(); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, closerMap, profileMap]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  if (safePage !== currentPage) setCurrentPage(safePage);

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);

  const hasFilters = filterCloser !== "all" || filterSDR !== "all" || filterStatus !== "all" || filterChannelType !== "all" || !!filterMeetingDateFrom || !!filterMeetingDateTo || !!filterCreatedDateFrom || !!filterCreatedDateTo || !!searchText || excludeWithSale || onlyWithSale || onlyWithOffer || filterOfferProduct !== "all";

  const clearFilters = () => {
    setFilterCloser("all");
    setFilterSDR("all");
    setFilterStatus("all");
    setFilterChannelType("all");
    setFilterMeetingDateFrom(undefined);
    setFilterMeetingDateTo(undefined);
    setFilterCreatedDateFrom(undefined);
    setFilterCreatedDateTo(undefined);
    setSearchText("");
    setExcludeWithSale(false);
    setOnlyWithSale(false);
    setOnlyWithOffer(false);
    setFilterOfferProduct("all");
    setCurrentPage(1);
  };

  const exportCSV = () => {
    const headers = ["Lead", "Telefone", "Closer", "Criado por", "Data Reunião", "Horário", "Criado em", "Status", "Motivo", "Canal", "Observação"];
    const rows = filtered.map((ag) => [
      ag.lead_name,
      ag.lead_phone,
      closerMap[ag.closer_id] || "—",
      sdrIdOf(ag) ? (profileMap[sdrIdOf(ag)!] || "—") : "—",
      format(new Date(ag.scheduled_date + "T12:00:00"), "dd/MM/yyyy"),
      ag.scheduled_time,
      formatBR(ag.created_at),
      STATUS_MAP[ag.status]?.label || ag.status,
      ag.meeting_reason || "—",
      (ag as any).channel_type || "—",
      (ag.observation || "").replace(/\n/g, " "),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reunioes_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const handleDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, deletion_reason: deleteReason.trim() })
        .eq("id", deleteTarget.id);
      if (error) throw error;
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change.
      toast.success("Agendamento excluído com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["reunioes-list"] });
    } catch {
      toast.error("Erro ao excluir agendamento.");
    }
    setDeleting(false);
    setDeleteTarget(null);
    setDeleteReason("");
  };

  const handleTransferCloser = async (ag: any, newCloserId: string) => {
    if (!newCloserId || newCloserId === ag.closer_id) return;
    const oldName = closerMap[ag.closer_id] || "—";
    const newName = closerMap[newCloserId] || "—";
    try {
      const { data, error } = await supabase.functions.invoke("google-transfer-event", {
        body: { agendamento_id: ag.id, new_closer_id: newCloserId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao transferir lead");
      const warnings: string[] = data?.warnings ?? [];
      await logAudit("transfer_lead", "agendamento", ag.id, {
        lead_name: ag.lead_name,
        scheduled_date: ag.scheduled_date,
        scheduled_time: ag.scheduled_time,
        from_closer: oldName,
        to_closer: newName,
        meet_link_old: ag.meet_link ?? null,
        meet_link_new: data?.meet_link ?? null,
        google_warnings: warnings,
      });
      if (warnings.includes("new_closer_not_connected")) {
        toast.warning(`Lead transferido para ${newName}, mas o novo closer não tem Google Calendar conectado.`);
      } else if (warnings.includes("create_event_failed")) {
        toast.warning(`Lead transferido para ${newName}, mas falhou ao criar o evento no Google.`);
      } else {
        toast.success(`Lead transferido para ${newName}`);
      }
      queryClient.invalidateQueries({ queryKey: ["reunioes-list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao transferir lead");
    }
  };

  const handleUpdateChannel = async (ag: any, newChannel: string) => {
    const oldChannel = (ag as any).channel_type || null;
    const next = newChannel === "__none" ? null : newChannel;
    if (next === oldChannel) return;
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ channel_type: next })
        .eq("id", ag.id);
      if (error) throw error;
      await logAudit("update_channel_type", "agendamento", ag.id, {
        lead_name: ag.lead_name,
        from_channel: oldChannel,
        to_channel: next,
      });
      toast.success("Canal atualizado");
      queryClient.invalidateQueries({ queryKey: ["reunioes-list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar canal");
    }
  };

  const paginationPages = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("ellipsis");
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
      if (safePage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safePage]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold tracking-tight">Lista de Reuniões</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {(isGestor || isModerador || isSupervisor) && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors",
                  sdrGlobalVisibility
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border bg-muted/30"
                )}>
                  <Switch
                    id="sdr-global-visibility"
                    checked={sdrGlobalVisibility}
                    disabled={savingSdrGlobalVisibility}
                    onCheckedChange={(v) => saveSdrGlobalVisibility(!!v)}
                    className={cn(sdrGlobalVisibility && "data-[state=checked]:bg-emerald-500")}
                  />
                  <Label htmlFor="sdr-global-visibility" className="text-xs cursor-pointer">
                    Visibilidade Global de SDRs
                  </Label>
                </div>
                {sdrGlobalVisibility && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-8 rounded-full border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
                        disabled={savingSdrGlobalVisibility}
                      >
                        <Users className="h-3.5 w-3.5" />
                        {sdrGlobalVisibilityUserIds.length === 0
                          ? "Todos os SDRs"
                          : `${sdrGlobalVisibilityUserIds.length} SDR${sdrGlobalVisibilityUserIds.length > 1 ? "s" : ""} selecionado${sdrGlobalVisibilityUserIds.length > 1 ? "s" : ""}`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-0">
                      <div className="p-3 border-b">
                        <p className="text-xs font-medium">Quem terá visibilidade global?</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Deixe vazio para aplicar a todos os SDRs.
                        </p>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline disabled:opacity-50"
                          disabled={savingSdrGlobalVisibility || sdrProfiles.length === 0}
                          onClick={() => saveSdrGlobalVisibilityUsers(sdrProfiles.map((p: any) => p.user_id))}
                        >
                          Selecionar todos
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                          disabled={savingSdrGlobalVisibility || sdrGlobalVisibilityUserIds.length === 0}
                          onClick={() => saveSdrGlobalVisibilityUsers([])}
                        >
                          Limpar
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {sdrProfiles.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-3 text-center">
                            Nenhum SDR ativo encontrado.
                          </p>
                        ) : (
                          sdrProfiles.map((p: any) => {
                            const checked = sdrGlobalVisibilityUserIds.includes(p.user_id);
                            return (
                              <button
                                key={p.user_id}
                                type="button"
                                disabled={savingSdrGlobalVisibility}
                                onClick={() => {
                                  const next = checked
                                    ? sdrGlobalVisibilityUserIds.filter((id) => id !== p.user_id)
                                    : [...sdrGlobalVisibilityUserIds, p.user_id];
                                  saveSdrGlobalVisibilityUsers(next);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors",
                                  checked && "bg-emerald-500/5"
                                )}
                              >
                                <div className={cn(
                                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                  checked
                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                    : "border-border"
                                )}>
                                  {checked && <Check className="h-3 w-3" />}
                                </div>
                                <span className="flex-1 truncate">{p.full_name || p.email}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
            <Badge variant="outline" className="text-muted-foreground">
              {filtered.length} reuniões
            </Badge>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card-intense rounded-xl p-4 space-y-3 border border-[hsl(0_0%_100%/0.06)]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-7 text-xs">
                <X className="h-3 w-3 mr-1" /> Limpar filtros
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSDR && user && sdrHasGlobalVisibility(user.id) ? "Buscar lead (todos os SDRs)..." : "Buscar lead..."}
                title={isSDR && user && sdrHasGlobalVisibility(user.id) ? "Busca cobre reuniões de todos os SDRs. Reuniões fora da janela de datas atual não entram no resultado — amplie o filtro 'Data da reunião' se necessário." : undefined}
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
                className="pl-9 glass-input"
              />
            </div>

            {canSeeAllPeers && (
              <Select value={filterCloser} onValueChange={(v) => { setFilterCloser(v); setCurrentPage(1); }}>
                <SelectTrigger className="glass-input"><SelectValue placeholder="Closer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Closers</SelectItem>
                  {closers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}

            {canSeeAllPeers && (
              <Select value={filterSDR} onValueChange={(v) => { setFilterSDR(v); setCurrentPage(1); }}>
                <SelectTrigger className="glass-input"><SelectValue placeholder="SDR" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os SDRs</SelectItem>
                  {sdrProfiles.map((p) => (<SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}

            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}>
              <SelectTrigger className="glass-input"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_MAP).map(([key, { label }]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={filterChannelType} onValueChange={(v) => { setFilterChannelType(v); setCurrentPage(1); }}>
              <SelectTrigger className="glass-input"><SelectValue placeholder="Canal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Canais</SelectItem>
                {CHANNEL_TYPES.map((ct) => (<SelectItem key={ct} value={ct}>{ct}</SelectItem>))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterMeetingDateFrom && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterMeetingDateFrom ? format(filterMeetingDateFrom, "dd/MM/yyyy") : "Reunião: de"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterMeetingDateFrom} onSelect={(d) => { setFilterMeetingDateFrom(d); setCurrentPage(1); }} locale={ptBR} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterMeetingDateTo && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterMeetingDateTo ? format(filterMeetingDateTo, "dd/MM/yyyy") : "Reunião: até"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterMeetingDateTo} onSelect={(d) => { setFilterMeetingDateTo(d); setCurrentPage(1); }} locale={ptBR} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterCreatedDateFrom && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterCreatedDateFrom ? format(filterCreatedDateFrom, "dd/MM/yyyy") : "Criação: de"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterCreatedDateFrom} onSelect={(d) => { setFilterCreatedDateFrom(d); setCurrentPage(1); }} locale={ptBR} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterCreatedDateTo && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterCreatedDateTo ? format(filterCreatedDateTo, "dd/MM/yyyy") : "Criação: até"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterCreatedDateTo} onSelect={(d) => { setFilterCreatedDateTo(d); setCurrentPage(1); }} locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setExcludeWithSale((v) => { const nv = !v; if (nv) setOnlyWithSale(false); return nv; }); setCurrentPage(1); }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                excludeWithSale
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", excludeWithSale ? "bg-primary" : "bg-muted-foreground/40")} />
              Excluir reuniões com venda fechada
            </button>
            <button
              type="button"
              onClick={() => { setOnlyWithSale((v) => { const nv = !v; if (nv) setExcludeWithSale(false); return nv; }); setCurrentPage(1); }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                onlyWithSale
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", onlyWithSale ? "bg-emerald-500" : "bg-muted-foreground/40")} />
              Somente vendas fechadas
            </button>
            <button
              type="button"
              onClick={() => { setOnlyWithOffer((v) => { const nv = !v; if (nv) { setExcludeWithSale(false); setOnlyWithSale(false); } return nv; }); setCurrentPage(1); }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                onlyWithOffer
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", onlyWithOffer ? "bg-amber-500" : "bg-muted-foreground/40")} />
              Somente com oferta de preço
            </button>
            <div className="inline-flex items-center gap-2">
              <Select
                value={filterOfferProduct}
                onValueChange={(v) => { setFilterOfferProduct(v); setCurrentPage(1); }}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-[220px] rounded-full border px-3 text-xs",
                    filterOfferProduct !== "all"
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                      : "border-border bg-transparent text-muted-foreground"
                  )}
                >
                  <SelectValue placeholder="Oferta do produto…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os produtos</SelectItem>
                  {offeredProducts.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>



        {/* Table */}
        <div className="glass-card-intense rounded-xl border border-[hsl(0_0%_100%/0.06)] .light:border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  {([
                    { key: "lead_name", label: "Lead" },
                    { key: "closer", label: "Closer" },
                    { key: "sdr", label: "Criado por" },
                    { key: "datetime", label: "Data/Hora" },
                    { key: "created_at", label: "Criado em" },
                    { key: "status", label: "Status" },
                    { key: "meeting_reason", label: "Motivo" },
                    { key: "channel_type", label: "Canal" },
                  ] as { key: SortKey; label: string }[]).map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key
                          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </span>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Observação</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 w-20 bg-muted/30 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhuma reunião encontrada
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((ag) => {
                    const st = STATUS_MAP[ag.status] || { label: ag.status, color: "bg-muted text-muted-foreground" };
                    return (
                      <tr key={ag.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{ag.lead_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />{ag.lead_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {canTransferCloser ? (
                            <Select
                              value={ag.closer_id || ""}
                              onValueChange={(newCloserId) => handleTransferCloser(ag, newCloserId)}
                            >
                              <SelectTrigger className="h-8 text-xs glass-input min-w-[140px]">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {closers.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            closerMap[ag.closer_id] || "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{sdrIdOf(ag) ? (profileMap[sdrIdOf(ag)!] || "—") : "—"}</td>
                        <td className="px-4 py-3">
                          <div>{format(new Date(ag.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{ag.scheduled_time}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatBR(ag.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant="outline" className={cn("text-[10px]", st.color)}>{st.label}</Badge>
                            {(ag as any).is_venda_avulsa && (
                              <Badge className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/15">
                                Venda avulsa
                              </Badge>
                            )}
                            {ag.status === "realizada" && !(ag as any).is_venda_avulsa && (() => {
                              const v = vendaOfertaMap.get(ag.id);
                              const ofertou = !!v && (v.vendeu === true || Number(v.valor) > 0);
                              return ofertou ? (
                                <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/15">
                                  Preço ofertado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  Sem oferta
                                </Badge>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{ag.meeting_reason || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {canDelete ? (
                            <Select
                              value={(ag as any).channel_type || "__none"}
                              onValueChange={(v) => handleUpdateChannel(ag, v)}
                            >
                              <SelectTrigger className="h-8 text-xs glass-input min-w-[140px]">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">—</SelectItem>
                                {CHANNEL_TYPES.map((ct) => (
                                  <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            (ag as any).channel_type || "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px]">
                          {(() => {
                            const urlRegex = /https?:\/\/[^\s]+/g;
                            const links = ag.observation?.match(urlRegex) || [];
                            if (links.length > 0) {
                              return links.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  Ver Briefing{links.length > 1 ? ` (${i + 1})` : ""}
                                </a>
                              ));
                            }
                            return "—";
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => setDetailTarget(ag)}
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget(ag)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-[hsl(0_0%_100%/0.06)] px-4 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={cn(safePage === 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  {paginationPages.map((p, i) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`e-${i}`}><PaginationEllipsis /></PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink isActive={p === safePage} onClick={() => setCurrentPage(p)}>
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={cn(safePage === totalPages && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
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

      {/* Detalhes do lead */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailTarget?.lead_name}</DialogTitle>
            <DialogDescription>
              {detailTarget && (
                <>
                  {format(new Date(detailTarget.scheduled_date + "T12:00:00"), "dd/MM/yyyy")} às {detailTarget.scheduled_time}
                  {detailTarget.closer_id && <> · Closer: <strong>{closerMap[detailTarget.closer_id] || "—"}</strong></>}
                  {sdrIdOf(detailTarget) && <> · SDR: <strong>{profileMap[sdrIdOf(detailTarget)!] || "—"}</strong></>}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Briefing (SDR)</h4>
              <p className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 min-h-[60px]">
                {detailTarget?.briefing?.trim() || <span className="text-muted-foreground italic">Sem briefing registrado.</span>}
              </p>
            </section>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {detailVenda?.vendeu === true ? "Valor da venda (Closer)" : "Preço ofertado (Closer)"}
              </h4>
              <div className="text-sm rounded-md border border-border bg-muted/30 p-3 space-y-1">
                {detailVenda?.valor != null ? (
                  <p className="font-semibold">
                    {Number(detailVenda.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                ) : (
                  <span className="text-muted-foreground italic">
                    {detailVenda?.vendeu === false ? "Sem oferta de preço registrada." : "Ainda não preenchido."}
                  </span>
                )}
                {detailVenda?.produto && (
                  <p className="text-xs text-muted-foreground">Produto: <strong className="text-foreground">{detailVenda.produto}</strong></p>
                )}
              </div>
            </section>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Por que não fechou (Closer)</h4>
              <p className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 min-h-[60px]">
                {detailVenda?.explicacao_nao_fechamento?.trim()
                  || <span className="text-muted-foreground italic">
                       {detailVenda?.vendeu === true ? "Venda fechada." : "Ainda não preenchido."}
                     </span>}
              </p>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Resumo do cliente (Closer)</h4>
              <p className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 min-h-[60px]">
                {detailVenda?.resumo_venda?.trim()
                  || <span className="text-muted-foreground italic">Ainda não preenchido.</span>}
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
