import { useQuery } from "@tanstack/react-query";
import { Users, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brTodayYMD, brNowHour, brNowMinute } from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface Closer {
  id: string;
  name: string;
}
interface TaskRow {
  assigned_closer_id: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
}
interface FollowUpVendaRow {
  follow_up: boolean;
  follow_up_date: string | null;
  follow_up_time: string | null;
  agendamentos: { closer_id: string | null; deleted_at: string | null } | null;
}

function isTimeBeforeNow(time: string | null): boolean {
  if (!time) return false;
  const [h, m] = time.split(":").map(Number);
  const nowH = brNowHour();
  const nowM = brNowMinute();
  if (h < nowH) return true;
  if (h === nowH && m <= nowM) return true;
  return false;
}

export default function CargaClosersTab() {
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
        .select("assigned_closer_id, status, due_date, due_time")
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
          follow_up, follow_up_date, follow_up_time,
          agendamentos!inner ( closer_id, deleted_at )
        `)
        .eq("follow_up", true)
        .eq("vendeu", false);
      const rows = (data ?? []) as unknown as FollowUpVendaRow[];
      return rows.filter((r) => !r.agendamentos?.deleted_at);
    },
    refetchInterval: 2 * 60 * 1000,
  });

  const today = brTodayYMD();

  const rows = closers.map((c) => {
    const myTasks = tasks.filter((t) => t.assigned_closer_id === c.id);
    let tasksOverdue = 0;
    let tasksFuture = 0;
    for (const t of myTasks) {
      if (!t.due_date) {
        tasksFuture++;
        continue;
      }
      if (t.due_date < today) tasksOverdue++;
      else if (t.due_date > today) tasksFuture++;
      else if (isTimeBeforeNow(t.due_time)) tasksOverdue++;
      else tasksFuture++;
    }

    const myFollowUps = followUps.filter(
      (f) => f.agendamentos?.closer_id === c.id,
    );
    let fuOverdue = 0;
    let fuFuture = 0;
    for (const f of myFollowUps) {
      if (!f.follow_up_date) continue;
      if (f.follow_up_date < today) fuOverdue++;
      else if (f.follow_up_date > today) fuFuture++;
      else if (isTimeBeforeNow(f.follow_up_time)) fuOverdue++;
      else fuFuture++;
    }
    const acompanhamento = myFollowUps.length;

    return {
      id: c.id,
      name: c.name,
      tasksOverdue,
      tasksFuture,
      fuOverdue,
      fuFuture,
      acompanhamento,
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Carga por Closer
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tarefas e follow-ups pendentes por Closer ativo. Atrasos destacados em vermelho.
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
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-primary/5">
                    <td className="py-2 px-2 font-medium">{r.name}</td>
                    <td className={cn(
                      "py-2 px-2 text-right font-bold",
                      r.tasksOverdue > 0 && "text-destructive",
                    )}>
                      {r.tasksOverdue}
                    </td>
                    <td className="py-2 px-2 text-right">{r.tasksFuture}</td>
                    <td className={cn(
                      "py-2 px-2 text-right font-bold",
                      r.fuOverdue > 0 && "text-destructive",
                    )}>
                      {r.fuOverdue}
                    </td>
                    <td className="py-2 px-2 text-right">{r.fuFuture}</td>
                    <td className="py-2 px-2 text-right font-semibold">{r.acompanhamento}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-primary/10 font-semibold">
                  <td className="py-2 px-2 text-xs text-muted-foreground uppercase">Total</td>
                  <td className={cn(
                    "py-2 px-2 text-right",
                    totals.tasksOverdue > 0 && "text-destructive",
                  )}>
                    {totals.tasksOverdue}
                  </td>
                  <td className="py-2 px-2 text-right">{totals.tasksFuture}</td>
                  <td className={cn(
                    "py-2 px-2 text-right",
                    totals.fuOverdue > 0 && "text-destructive",
                  )}>
                    {totals.fuOverdue}
                  </td>
                  <td className="py-2 px-2 text-right">{totals.fuFuture}</td>
                  <td className="py-2 px-2 text-right">{totals.acompanhamento}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
