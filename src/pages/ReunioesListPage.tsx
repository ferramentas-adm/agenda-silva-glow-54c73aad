import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, Search, X, CalendarDays, Filter, Download } from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  confirmada: { label: "Confirmada", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  realizada: { label: "Realizada", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cancelada: { label: "Cancelada", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  reagendada: { label: "Reagendada", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  no_show: { label: "No-show", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  nao_confirmada: { label: "Não Confirmada", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const MEETING_REASONS = ["Segunda Reunião", "Fechamento", "Remarcado", "Outros"];
const CHANNEL_TYPES = ["CTA", "Tráfego Pago", "Reativação", "Social Selling", "Renovação", "Indicação", "Formulário Bio"];
const PAGE_SIZE = 20;

export default function ReunioesListPage() {
  const [filterCloser, setFilterCloser] = useState<string>("all");
  const [filterSDR, setFilterSDR] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterMeetingDate, setFilterMeetingDate] = useState<Date | undefined>();
  const [filterCreatedDate, setFilterCreatedDate] = useState<Date | undefined>();
  const [searchText, setSearchText] = useState("");
  const [filterChannelType, setFilterChannelType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").eq("active", true).order("full_name");
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

  const { data: agendamentos = [], isLoading } = useQuery({
    queryKey: ["reunioes-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("*")
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: false })
        .order("scheduled_time", { ascending: false });
      return data || [];
    },
  });

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

  // Only profiles with SDR role for SDR filter
  const sdrProfiles = useMemo(() => profiles.filter((p) => roleMap[p.user_id] === "sdr"), [profiles, roleMap]);

  const filtered = useMemo(() => {
    return agendamentos.filter((ag) => {
      if (filterCloser !== "all" && ag.closer_id !== filterCloser) return false;
      if (filterSDR !== "all" && ag.created_by !== filterSDR) return false;
      if (filterStatus !== "all" && ag.status !== filterStatus) return false;
      if (filterChannelType !== "all" && (ag as any).channel_type !== filterChannelType) return false;
      if (filterReason !== "all") {
        if (!ag.meeting_reason) return false;
        if (filterReason === "Outros" && !MEETING_REASONS.slice(0, 3).includes(ag.meeting_reason) && ag.meeting_reason !== "Outros") {
          // custom reason counts as "Outros"
        } else if (ag.meeting_reason !== filterReason) {
          return false;
        }
      }
      if (filterMeetingDate && ag.scheduled_date !== format(filterMeetingDate, "yyyy-MM-dd")) return false;
      if (filterCreatedDate && !ag.created_at.startsWith(format(filterCreatedDate, "yyyy-MM-dd"))) return false;
      if (searchText) {
        const s = searchText.toLowerCase();
        if (!ag.lead_name.toLowerCase().includes(s) && !ag.lead_phone.includes(s)) return false;
      }
      return true;
    });
  }, [agendamentos, filterCloser, filterSDR, filterStatus, filterReason, filterChannelType, filterMeetingDate, filterCreatedDate, searchText]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  if (safePage !== currentPage) setCurrentPage(safePage);

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const hasFilters = filterCloser !== "all" || filterSDR !== "all" || filterStatus !== "all" || filterReason !== "all" || filterChannelType !== "all" || !!filterMeetingDate || !!filterCreatedDate || !!searchText;

  const clearFilters = () => {
    setFilterCloser("all");
    setFilterSDR("all");
    setFilterStatus("all");
    setFilterReason("all");
    setFilterChannelType("all");
    setFilterMeetingDate(undefined);
    setFilterCreatedDate(undefined);
    setSearchText("");
    setCurrentPage(1);
  };

  const exportCSV = () => {
    const headers = ["Lead", "Telefone", "Closer", "Criado por", "Data Reunião", "Horário", "Criado em", "Status", "Motivo", "Canal", "Observação"];
    const rows = filtered.map((ag) => [
      ag.lead_name,
      ag.lead_phone,
      closerMap[ag.closer_id] || "—",
      ag.created_by ? (profileMap[ag.created_by] || "—") : "—",
      format(new Date(ag.scheduled_date + "T12:00:00"), "dd/MM/yyyy"),
      ag.scheduled_time,
      format(new Date(ag.created_at), "dd/MM/yyyy HH:mm"),
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
          <div className="flex items-center gap-2">
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
              <Input placeholder="Buscar lead..." value={searchText} onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }} className="pl-9 glass-input" />
            </div>

            <Select value={filterCloser} onValueChange={(v) => { setFilterCloser(v); setCurrentPage(1); }}>
              <SelectTrigger className="glass-input"><SelectValue placeholder="Closer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Closers</SelectItem>
                {closers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={filterSDR} onValueChange={(v) => { setFilterSDR(v); setCurrentPage(1); }}>
              <SelectTrigger className="glass-input"><SelectValue placeholder="SDR" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os SDRs</SelectItem>
                {sdrProfiles.map((p) => (<SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}>
              <SelectTrigger className="glass-input"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_MAP).map(([key, { label }]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={filterReason} onValueChange={(v) => { setFilterReason(v); setCurrentPage(1); }}>
              <SelectTrigger className="glass-input"><SelectValue placeholder="Motivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Motivos</SelectItem>
                {MEETING_REASONS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
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
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterMeetingDate && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterMeetingDate ? format(filterMeetingDate, "dd/MM/yyyy") : "Data da reunião"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterMeetingDate} onSelect={(d) => { setFilterMeetingDate(d); setCurrentPage(1); }} locale={ptBR} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterCreatedDate && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterCreatedDate ? format(filterCreatedDate, "dd/MM/yyyy") : "Data de criação"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterCreatedDate} onSelect={(d) => { setFilterCreatedDate(d); setCurrentPage(1); }} locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Table */}
        <div className="glass-card-intense rounded-xl border border-[hsl(0_0%_100%/0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(0_0%_100%/0.06)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Closer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Criado por</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Data/Hora</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Criado em</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Motivo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Canal</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(0_0%_100%/0.04)]">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 w-20 bg-muted/30 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhuma reunião encontrada
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((ag) => {
                    const st = STATUS_MAP[ag.status] || { label: ag.status, color: "bg-muted text-muted-foreground" };
                    return (
                      <tr key={ag.id} className="hover:bg-[hsl(0_0%_100%/0.02)] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{ag.lead_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />{ag.lead_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{closerMap[ag.closer_id] || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ag.created_by ? (profileMap[ag.created_by] || "—") : "—"}</td>
                        <td className="px-4 py-3">
                          <div>{format(new Date(ag.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{ag.scheduled_time}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(ag.created_at), "dd/MM/yyyy HH:mm")}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-[10px]", st.color)}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{ag.meeting_reason || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{(ag as any).channel_type || "—"}</td>
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
    </AppLayout>
  );
}
