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
import { ScrollText, Search, ChevronLeft, ChevronRight } from "lucide-react";

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
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
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
  }, [logs, search, entityFilter]);

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico de todas as ações realizadas no sistema.
          </p>
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
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          {ENTITY_LABELS[log.entity_type] || log.entity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[300px]">
                        <p className="text-xs text-muted-foreground truncate">
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

function formatDetails(log: AuditLog): string {
  const d = log.details;
  if (!d || Object.keys(d).length === 0) return "—";

  const parts: string[] = [];
  if (d.lead_name) parts.push(`Lead: ${d.lead_name}`);
  if (d.closer_name) parts.push(`Closer: ${d.closer_name}`);
  if (d.status) parts.push(`Status: ${d.status}`);
  if (d.reason) parts.push(`Motivo: ${d.reason}`);
  if (d.name) parts.push(`Nome: ${d.name}`);
  if (d.role) parts.push(`Função: ${d.role}`);
  if (d.new_role) parts.push(`Nova função: ${d.new_role}`);

  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(d);
}
