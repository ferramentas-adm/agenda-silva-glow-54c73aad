import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, AlertTriangle, Clock, Phone, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { brTodayYMD, brNowHour, brNowMinute } from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface Closer {
  id: string;
  name: string;
}
interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  assigned_closer_id: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
  agendamento_id: string | null;
}
interface FollowUpVendaRow {
  id: string;
  follow_up: boolean;
  follow_up_date: string | null;
  follow_up_time: string | null;
  motivo_nao_fechamento: string | null;
  agendamentos: {
    id: string;
    lead_name: string;
    lead_phone: string;
    closer_id: string | null;
    deleted_at: string | null;
    briefing: string | null;
  } | null;
}

type Bucket =
  | "tasksOverdue"
  | "tasksFuture"
  | "fuOverdue"
  | "fuFuture"
  | "acompanhamento";

const BUCKET_LABEL: Record<Bucket, string> = {
  tasksOverdue: "Tarefas atrasadas",
  tasksFuture: "Tarefas futuras",
  fuOverdue: "Follow-ups atrasados",
  fuFuture: "Follow-ups futuros",
  acompanhamento: "Em acompanhamento",
};

function isTimeBeforeNow(time: string | null): boolean {
  if (!time) return false;
  const [h, m] = time.split(":").map(Number);
  const nowH = brNowHour();
  const nowM = brNowMinute();
  if (h < nowH) return true;
  if (h === nowH && m <= nowM) return true;
  return false;
}

function classifyByDateTime(date: string | null, time: string | null, today: string): "overdue" | "future" | "none" {
  if (!date) return "future";
  if (date < today) return "overdue";
  if (date > today) return "future";
  return isTimeBeforeNow(time) ? "overdue" : "future";
}

export default function CargaClosersTab() {
  const [drill, setDrill] = useState<{ closer: Closer; bucket: Bucket } | null>(null);

  const { data: closers = [], isLoading: loadingClosers } = useQuery({
    queryKey: ["carga-closers-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return (data ?? []) as Closer[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["carga-closers-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, description, assigned_closer_id, status, due_date, due_time, agendamento_id")
        .eq("status", "pendente");
      return (data ?? []) as TaskRow[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: followUps = [] } = useQuery({
    queryKey: ["carga-closers-followups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select(`
          id, follow_up, follow_up_date, follow_up_time, motivo_nao_fechamento,
          agendamentos!inner ( id, lead_name, lead_phone, closer_id, deleted_at, briefing )
        `)
        .eq("follow_up", true)
        .eq("vendeu", false);
      const rows = (data ?? []) as unknown as FollowUpVendaRow[];
      return rows.filter((r) => !r.agendamentos?.deleted_at);
    },
    refetchInterval: 2 * 60 * 1000,
  });

  // Lead names for tasks (via agendamento_id)
  const taskAgendamentoIds = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.agendamento_id).filter((v): v is string => !!v))),
    [tasks],
  );

  const { data: taskLeads = [] } = useQuery({
    queryKey: ["carga-task-leads", taskAgendamentoIds.join(",")],
    enabled: taskAgendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone")
        .in("id", taskAgendamentoIds);
      return data ?? [];
    },
  });
  const taskLeadMap = useMemo(() => {
    const m = new Map<string, { lead_name: string; lead_phone: string }>();
    (taskLeads as any[]).forEach((a) => m.set(a.id, { lead_name: a.lead_name, lead_phone: a.lead_phone }));
    return m;
  }, [taskLeads]);

  // Resumos de venda (o que o cliente vende) por agendamento
  const allAgendamentoIds = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach((t) => t.agendamento_id && ids.add(t.agendamento_id));
    followUps.forEach((f) => f.agendamentos?.id && ids.add(f.agendamentos.id));
    return Array.from(ids);
  }, [tasks, followUps]);

  const { data: vendaResumos = [] } = useQuery({
    queryKey: ["carga-venda-resumos", allAgendamentoIds.join(",")],
    enabled: allAgendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("agendamento_id, resumo_venda, updated_at")
        .in("agendamento_id", allAgendamentoIds)
        .not("resumo_venda", "is", null);
      return data ?? [];
    },
  });
  const resumoMap = useMemo(() => {
    const m = new Map<string, string>();
    (vendaResumos as any[]).forEach((v) => {
      const r = v.resumo_venda?.trim();
      if (!r) return;
      const cur = m.get(v.agendamento_id);
      if (!cur) m.set(v.agendamento_id, r);
    });
    return m;
  }, [vendaResumos]);

  const today = brTodayYMD();

  const rows = closers.map((c) => {
    const myTasks = tasks.filter((t) => t.assigned_closer_id === c.id);
    let tasksOverdue = 0;
    let tasksFuture = 0;
    for (const t of myTasks) {
      if (classifyByDateTime(t.due_date, t.due_time, today) === "overdue") tasksOverdue++;
      else tasksFuture++;
    }

    const myFollowUps = followUps.filter((f) => f.agendamentos?.closer_id === c.id);
    let fuOverdue = 0;
    let fuFuture = 0;
    for (const f of myFollowUps) {
      if (!f.follow_up_date) continue;
      const cls = classifyByDateTime(f.follow_up_date, f.follow_up_time, today);
      if (cls === "overdue") fuOverdue++;
      else fuFuture++;
    }

    return {
      id: c.id,
      name: c.name,
      tasksOverdue,
      tasksFuture,
      fuOverdue,
      fuFuture,
      acompanhamento: myFollowUps.length,
      totalOverdue: tasksOverdue + fuOverdue,
    };
  });

  rows.sort((a, b) => b.totalOverdue - a.totalOverdue || b.acompanhamento - a.acompanhamento);

  const totals = rows.reduce(
    (acc, r) => ({
      tasksOverdue: acc.tasksOverdue + r.tasksOverdue,
      tasksFuture: acc.tasksFuture + r.tasksFuture,
      fuOverdue: acc.fuOverdue + r.fuOverdue,
      fuFuture: acc.fuFuture + r.fuFuture,
      acompanhamento: acc.acompanhamento + r.acompanhamento,
    }),
    { tasksOverdue: 0, tasksFuture: 0, fuOverdue: 0, fuFuture: 0, acompanhamento: 0 },
  );

  // Build drill items
  const drillItems = useMemo(() => {
    if (!drill) return [];
    const { closer, bucket } = drill;

    if (bucket === "tasksOverdue" || bucket === "tasksFuture") {
      const wantOverdue = bucket === "tasksOverdue";
      return tasks
        .filter((t) => t.assigned_closer_id === closer.id)
        .filter((t) => (classifyByDateTime(t.due_date, t.due_time, today) === "overdue") === wantOverdue)
        .sort((a, b) => {
          const da = (a.due_date ?? "9999-12-31") + (a.due_time ?? "00:00");
          const db = (b.due_date ?? "9999-12-31") + (b.due_time ?? "00:00");
          return da.localeCompare(db);
        })
        .map((t) => ({
          kind: "task" as const,
          id: t.id,
          title: t.title,
          description: t.description,
          date: t.due_date,
          time: t.due_time,
          lead: t.agendamento_id ? taskLeadMap.get(t.agendamento_id) ?? null : null,
          resumo: t.agendamento_id ? resumoMap.get(t.agendamento_id) ?? null : null,
        }));
    }

    // follow-ups buckets
    let list = followUps.filter((f) => f.agendamentos?.closer_id === closer.id);
    if (bucket === "fuOverdue") {
      list = list.filter((f) => classifyByDateTime(f.follow_up_date, f.follow_up_time, today) === "overdue");
    } else if (bucket === "fuFuture") {
      list = list.filter((f) => classifyByDateTime(f.follow_up_date, f.follow_up_time, today) === "future");
    }
    return list
      .sort((a, b) => {
        const da = (a.follow_up_date ?? "9999-12-31") + (a.follow_up_time ?? "00:00");
        const db = (b.follow_up_date ?? "9999-12-31") + (b.follow_up_time ?? "00:00");
        return da.localeCompare(db);
      })
      .map((f) => ({
        kind: "followup" as const,
        id: f.id,
        title: f.agendamentos?.lead_name ?? "—",
        description: f.motivo_nao_fechamento,
        date: f.follow_up_date,
        time: f.follow_up_time,
        lead: f.agendamentos
          ? { lead_name: f.agendamentos.lead_name, lead_phone: f.agendamentos.lead_phone }
          : null,
        resumo: f.agendamentos?.id ? resumoMap.get(f.agendamentos.id) ?? null : null,
      }));
  }, [drill, tasks, followUps, today, taskLeadMap, resumoMap]);

  const renderClickable = (
    closer: Closer,
    bucket: Bucket,
    value: number,
    extraClass?: string,
  ) => (
    <button
      type="button"
      onClick={() => value > 0 && setDrill({ closer, bucket })}
      disabled={value === 0}
      className={cn(
        "w-full text-right font-bold tabular-nums rounded px-1 py-0.5 transition-colors",
        value > 0 ? "hover:bg-primary/10 cursor-pointer" : "cursor-default opacity-70",
        extraClass,
      )}
    >
      {value}
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Follows por Closer
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tarefas e follow-ups pendentes por Closer ativo. Clique nos números para ver os leads.
        </p>
      </CardHeader>
      <CardContent>
        {loadingClosers ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum Closer ativo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/10 text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium text-xs">Closer</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      Tarefas atrasadas
                    </span>
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Tarefas futuras</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      Follow-ups atrasados
                    </span>
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Follow-ups futuros</th>
                  <th className="text-right py-2 px-2 font-medium text-xs">Em acompanhamento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const closer = { id: r.id, name: r.name };
                  return (
                    <tr key={r.id} className="border-b border-primary/5">
                      <td className="py-2 px-2 font-medium">{r.name}</td>
                      <td className="py-2 px-2 text-right">
                        {renderClickable(closer, "tasksOverdue", r.tasksOverdue, r.tasksOverdue > 0 ? "text-destructive" : "")}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {renderClickable(closer, "tasksFuture", r.tasksFuture)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {renderClickable(closer, "fuOverdue", r.fuOverdue, r.fuOverdue > 0 ? "text-destructive" : "")}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {renderClickable(closer, "fuFuture", r.fuFuture)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {renderClickable(closer, "acompanhamento", r.acompanhamento, "font-semibold")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-primary/10 font-semibold">
                  <td className="py-2 px-2 text-xs text-muted-foreground uppercase">Total</td>
                  <td className={cn("py-2 px-2 text-right tabular-nums", totals.tasksOverdue > 0 && "text-destructive")}>
                    {totals.tasksOverdue}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.tasksFuture}</td>
                  <td className={cn("py-2 px-2 text-right tabular-nums", totals.fuOverdue > 0 && "text-destructive")}>
                    {totals.fuOverdue}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.fuFuture}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.acompanhamento}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drill ? `${BUCKET_LABEL[drill.bucket]} — ${drill.closer.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {drillItems.length} {drillItems.length === 1 ? "registro" : "registros"}
            </DialogDescription>
          </DialogHeader>

          {drillItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center italic">Nada por aqui.</p>
          ) : (
            <div className="space-y-2">
              {drillItems.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserIcon className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">{item.title}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      <span>
                        {item.date
                          ? `${format(new Date(item.date + "T12:00:00"), "dd/MM", { locale: ptBR })}${item.time ? ` às ${item.time}` : ""}`
                          : "Sem data"}
                      </span>
                    </div>
                    {item.lead?.lead_phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{item.lead.lead_phone}</span>
                      </div>
                    )}
                    {item.kind === "task" && item.lead?.lead_name && (
                      <div className="col-span-2 truncate">
                        <span className="font-medium text-foreground/70">Lead:</span> {item.lead.lead_name}
                      </div>
                    )}
                    {item.description && (
                      <div className="col-span-2 mt-1 rounded-md border border-border/60 bg-muted/40 p-2">
                        <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                          {item.description}
                        </p>
                      </div>
                    )}
                    {item.resumo && (
                      <div className="col-span-2 mt-1 rounded-md border border-border/60 bg-muted/40 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70 mb-1">
                          Resumo do cliente
                        </p>
                        <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                          {item.resumo}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
