import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, User, Search, X, CalendarDays, Filter } from "lucide-react";

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
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  confirmada: { label: "Confirmada", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  pendente: { label: "Pendente", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  realizada: { label: "Realizada", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cancelada: { label: "Cancelada", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  reagendada: { label: "Reagendada", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  no_show: { label: "No-show", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  nao_confirmada: { label: "Não Confirmada", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const MEETING_REASONS = ["Segunda Reunião", "Fechamento", "Remarcado", "Outros"];

export default function ReunioesListPage() {
  const [filterCloser, setFilterCloser] = useState<string>("all");
  const [filterSDR, setFilterSDR] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterMeetingDate, setFilterMeetingDate] = useState<Date | undefined>();
  const [filterCreatedDate, setFilterCreatedDate] = useState<Date | undefined>();
  const [searchText, setSearchText] = useState("");

  // Fetch closers
  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return data || [];
    },
  });

  // Fetch profiles (SDRs / creators)
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").eq("active", true).order("full_name");
      return data || [];
    },
  });

  // Fetch agendamentos
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

  const filtered = useMemo(() => {
    return agendamentos.filter((ag) => {
      if (filterCloser !== "all" && ag.closer_id !== filterCloser) return false;
      if (filterSDR !== "all" && ag.created_by !== filterSDR) return false;
      if (filterStatus !== "all" && ag.status !== filterStatus) return false;
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
  }, [agendamentos, filterCloser, filterSDR, filterStatus, filterReason, filterMeetingDate, filterCreatedDate, searchText]);

  const hasFilters = filterCloser !== "all" || filterSDR !== "all" || filterStatus !== "all" || filterReason !== "all" || !!filterMeetingDate || !!filterCreatedDate || !!searchText;

  const clearFilters = () => {
    setFilterCloser("all");
    setFilterSDR("all");
    setFilterStatus("all");
    setFilterReason("all");
    setFilterMeetingDate(undefined);
    setFilterCreatedDate(undefined);
    setSearchText("");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold tracking-tight">Lista de Reuniões</h1>
          <Badge variant="outline" className="text-muted-foreground">
            {filtered.length} reuniões
          </Badge>
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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar lead..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 glass-input"
              />
            </div>

            {/* Closer */}
            <Select value={filterCloser} onValueChange={setFilterCloser}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Closer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Closers</SelectItem>
                {closers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* SDR */}
            <Select value={filterSDR} onValueChange={setFilterSDR}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="SDR / Criador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os SDRs</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Meeting Reason */}
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Motivos</SelectItem>
                {MEETING_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Meeting Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterMeetingDate && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterMeetingDate ? format(filterMeetingDate, "dd/MM/yyyy") : "Data da reunião"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterMeetingDate} onSelect={setFilterMeetingDate} locale={ptBR} />
              </PopoverContent>
            </Popover>

            {/* Created Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input justify-start text-left font-normal", !filterCreatedDate && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {filterCreatedDate ? format(filterCreatedDate, "dd/MM/yyyy") : "Data de criação"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterCreatedDate} onSelect={setFilterCreatedDate} locale={ptBR} />
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(0_0%_100%/0.04)]">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 w-20 bg-muted/30 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhuma reunião encontrada
                    </td>
                  </tr>
                ) : (
                  filtered.map((ag) => {
                    const st = STATUS_MAP[ag.status] || { label: ag.status, color: "bg-muted text-muted-foreground" };
                    return (
                      <tr key={ag.id} className="hover:bg-[hsl(0_0%_100%/0.02)] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{ag.lead_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {ag.lead_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {closerMap[ag.closer_id] || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {ag.created_by ? (profileMap[ag.created_by] || "—") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div>{format(new Date(ag.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{ag.scheduled_time}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {format(new Date(ag.created_at), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-[10px]", st.color)}>
                            {st.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {ag.meeting_reason || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate" title={ag.observation || ""}>
                          {ag.observation || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
