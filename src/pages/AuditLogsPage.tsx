import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollText, Search, ChevronLeft, ChevronRight, CalendarIcon, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRDateTime, pickedDateToYMD } from "@/lib/timezone";

interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  create_agendamento: "Criou agendamento",
  update_status: "Atualizou status",
  delete_agendamento: "Excluiu agendamento",
  create_user: "Criou usuário",
  delete_user: "Excluiu usuário",
  change_password: "Alterou senha",
  change_role: "Alterou função",
  toggle_active: "Ativou/Desativou",
  update_settings: "Atualizou configurações",
  login: "Login",
  edit_agendamento: "Editou agendamento",
  edit_briefing: "Adicionou/editou briefing",
  remove_briefing: "Removeu briefing",
};

const ENTITY_LABELS: Record<string, string> = {
  agendamento: "Agendamento",
  user: "Usuário",
  closer: "Closer",
  settings: "Configurações",
};

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityIdFilter, setEntityIdFilter] = useState("");
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, dateFrom?.toISOString(), dateTo?.toISOString(), entityIdFilter],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (dateFrom) {
        query = query.gte("created_at", format(dateFrom, "yyyy-MM-dd"));
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        query = query.lt("created_at", format(endDate, "yyyy-MM-dd"));
      }
      if (entityIdFilter.trim()) {
        query = query.eq("entity_id", entityIdFilter.trim());
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count } = await query;
      return { logs: (data ?? []) as AuditLog[], total: count ?? 0 };
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = useMemo(() => {
    let result = logs;
    if (entityFilter !== "all") {
      result = result.filter((l) => l.entity_type === entityFilter);
    }
    if (actionFilter !== "all") {
      result = result.filter((l) => l.action === actionFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.user_name.toLowerCase().includes(s) ||
          (ACTION_LABELS[l.action] || l.action).toLowerCase().includes(s) ||
          JSON.stringify(l.details).toLowerCase().includes(s)
      );
    }
    return result;
  }, [logs, search, entityFilter, actionFilter]);

  // CSV export for agendamentos report
  const handleExportCSV = async () => {
    // Fetch all agendamentos (including deleted) for the period
    let agQuery = supabase
      .from("agendamentos")
      .select("*")
      .order("scheduled_date", { ascending: false });

    if (dateFrom) {
      agQuery = agQuery.gte("scheduled_date", format(dateFrom, "yyyy-MM-dd"));
    }
    if (dateTo) {
      agQuery = agQuery.gte("scheduled_date", format(dateFrom || new Date(0), "yyyy-MM-dd"))
        .lte("scheduled_date", format(dateTo, "yyyy-MM-dd"));
    }

    const [{ data: agendamentos }, { data: closers }, { data: profiles }] = await Promise.all([
      agQuery,
      supabase.from("closers").select("id, name"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);

    const closerMap = new Map((closers ?? []).map((c: any) => [c.id, c.name]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.full_name]));

    const rows = (agendamentos ?? []).map((a: any) => ({
      "Data": a.scheduled_date,
      "Horário": a.scheduled_time,
      "Lead": a.lead_name,
      "Telefone": a.lead_phone,
      "Closer": closerMap.get(a.closer_id) || a.closer_id,
      "SDR (Criado por)": profileMap.get(a.created_by) || a.created_by,
      "Status": STATUS_LABELS_AG[a.status] || a.status,
      "Link da Reunião": a.meet_link || "",
      "Observações": a.observation || "",
      "Criado em": a.created_at ? format(new Date(a.created_at), "dd/MM/yyyy HH:mm") : "",
      "Excluído em": a.deleted_at ? format(new Date(a.deleted_at), "dd/MM/yyyy HH:mm") : "",
      "Motivo Exclusão": a.deletion_reason || "",
    }));

    // Build CSV
    if (rows.length === 0) {
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(";"),
      ...rows.map((row: any) =>
        headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(";")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-reunioes-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearDates = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ScrollText className="h-6 w-6 text-primary" />
              Audit Logs
            </h1>
            <p className="text-sm text-muted-foreground">
              Histórico de todas as ações realizadas no sistema.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuário ou ação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ID do agendamento..."
              value={entityIdFilter}
              onChange={(e) => { setEntityIdFilter(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="agendamento">Agendamentos</SelectItem>
              <SelectItem value="user">Usuários</SelectItem>
              <SelectItem value="closer">Closers</SelectItem>
              <SelectItem value="settings">Configurações</SelectItem>
          </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date from */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-2 text-xs", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(d) => { setDateFrom(d); setPage(0); }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Date to */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-2 text-xs", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(d) => { setDateTo(d); setPage(0); }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={clearDates}>
              Limpar datas
            </Button>
          )}
          {entityIdFilter && (
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => { setEntityIdFilter(""); setPage(0); }}>
              ✕ Filtro por agendamento
            </Button>
          )}
        </div>

        {/* Logs table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary/20 bg-card py-12 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum log encontrado.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-primary/10 bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-primary/10 bg-secondary/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data/Hora</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Usuário</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ação</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b border-primary/5 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {log.user_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {ACTION_LABELS[log.action] || log.action}
                        {log.action === "update_status" && log.details && (log.details as any).old_status && (log.details as any).new_status && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({STATUS_LABELS_DETAIL[String((log.details as any).old_status)] || String((log.details as any).old_status)} → {STATUS_LABELS_DETAIL[String((log.details as any).new_status)] || String((log.details as any).new_status)})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          {ENTITY_LABELS[log.entity_type] || log.entity_type}
                        </span>
                        {log.entity_id && log.entity_type === "agendamento" && (
                          <button
                            onClick={() => { setEntityIdFilter(log.entity_id!); setPage(0); }}
                            className="ml-1.5 text-[10px] text-primary/70 hover:text-primary underline cursor-pointer"
                            title="Ver todas as ações deste agendamento"
                          >
                            🔍
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[420px]">
                        <p className="text-xs text-muted-foreground whitespace-normal break-words">
                          {formatDetails(log)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-primary/10 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

const STATUS_LABELS_AG: Record<string, string> = {
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
};

const STATUS_LABELS_DETAIL: Record<string, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
  nao_confirmada: "Não confirmada",
};

const FIELD_LABELS: Record<string, string> = {
  closer_id: "Closer",
  sdr_responsavel_id: "Responsável (SDR)",
  scheduled_time: "Horário",
  scheduled_date: "Data",
  status: "Status",
};

function formatDateBR(dateStr: string, timeStr?: string | null): string {
  try {
    const [y, m, day] = String(dateStr).split("-");
    return `${day}/${m}/${y}${timeStr ? ` às ${timeStr}` : ""}`;
  } catch {
    return `${dateStr}${timeStr ? ` às ${timeStr}` : ""}`;
  }
}

function formatDetails(log: AuditLog): string {
  const d = log.details;
  if (!d || Object.keys(d).length === 0) return "—";

  const parts: string[] = [];
  if (d.lead_name) parts.push(`Lead: ${d.lead_name}`);

  // create_agendamento → mostrar closer + data/hora da reunião
  if (log.action === "create_agendamento") {
    if (d.closer_name) parts.push(`Closer: ${d.closer_name}`);
    if (d.scheduled_date) parts.push(`Reunião: ${formatDateBR(String(d.scheduled_date), d.scheduled_time as string | undefined)}`);
    return parts.length > 0 ? parts.join(" · ") : JSON.stringify(d);
  }

  // edit_agendamento → mostrar campo editado de/para
  if (log.action === "edit_agendamento" && d.field) {
    const fieldLabel = FIELD_LABELS[String(d.field)] || String(d.field);
    const fromVal = d.from != null && d.from !== "" ? String(d.from) : "—";
    const toVal = d.to != null && d.to !== "" ? String(d.to) : "—";
    if (d.scheduled_date) parts.push(`Reunião: ${formatDateBR(String(d.scheduled_date), d.scheduled_time as string | undefined)}`);
    parts.push(`${fieldLabel}: ${fromVal} → ${toVal}`);
    return parts.length > 0 ? parts.join(" · ") : JSON.stringify(d);
  }

  if (d.closer_name) parts.push(`Closer: ${d.closer_name}`);
  if (d.scheduled_date) {
    parts.push(`Data: ${formatDateBR(String(d.scheduled_date), d.scheduled_time as string | undefined)}`);
  }
  // Show old → new status for update_status action
  if (log.action === "update_status" && d.old_status && d.new_status) {
    const oldLabel = STATUS_LABELS_DETAIL[String(d.old_status)] || String(d.old_status);
    const newLabel = STATUS_LABELS_DETAIL[String(d.new_status)] || String(d.new_status);
    parts.push(`Status: ${oldLabel} → ${newLabel}`);
  } else if (d.status) {
    parts.push(`Status: ${STATUS_LABELS_DETAIL[String(d.status)] || d.status}`);
  }
  if (d.reason) parts.push(`Motivo: ${d.reason}`);
  if (d.name) parts.push(`Nome: ${d.name}`);
  if (d.role) parts.push(`Função: ${d.role}`);
  if (d.new_role) parts.push(`Nova função: ${d.new_role}`);

  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(d);
}
