import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isToday, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ListTodo, Plus, Pencil, Trash2, Loader2, CalendarIcon, CheckCircle2, Circle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCan } from "@/hooks/usePermissions";
import { toast } from "sonner";
import FollowUpAddDialog from "@/components/FollowUpAddDialog";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { logAudit } from "@/services/auditLog";

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  status: string;
  assigned_closer_id: string | null;
  created_by: string;
  completed_at: string | null;
  closers?: { id: string; name: string } | null;
}

export default function TasksSection() {
  const { user, role } = useAuth();
  const isCloser = role === "closer";
  const isManager = role === "gestor" || role === "moderador";
  const canManage = useCan("manage_tasks");
  const queryClient = useQueryClient();

  const [openDialog, setOpenDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Descobre o closer_id do usuário (caso seja closer)
  const { data: myCloserId } = useQuery({
    queryKey: ["my-closer-id", user?.email],
    enabled: isCloser && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id").eq("email", user!.email!).maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, closers ( id, name )")
        .order("status", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("due_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });

  const { data: closersList = [] } = useQuery({
    queryKey: ["tasks-closers"],
    enabled: isManager,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const today = startOfToday();
    const overdue: Task[] = [];
    const todayList: Task[] = [];
    const upcoming: Task[] = [];
    const completed: Task[] = [];
    for (const t of tasks) {
      if (t.status === "concluida") { completed.push(t); continue; }
      if (!t.due_date) { upcoming.push(t); continue; }
      const d = parseISO(t.due_date);
      if (isToday(d)) todayList.push(t);
      else if (isBefore(d, today)) overdue.push(t);
      else upcoming.push(t);
    }
    return { overdue, todayList, upcoming, completed };
  }, [tasks]);

  const toggleStatus = async (task: Task) => {
    if (!canManage) return;
    const newStatus = task.status === "concluida" ? "pendente" : "concluida";
    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "concluida" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit(`tarefa_${newStatus}`, "task", task.id, { title: task.title });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("tasks").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      await logAudit("tarefa_excluida", "task", deleteTarget.id, { title: deleteTarget.title });
      toast.success("Tarefa excluída.");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDeleteTarget(null);
    }
    setDeleting(false);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Tarefas
          <Badge variant="outline" className="text-[10px]">
            {tasks.filter((t) => t.status !== "concluida").length} em aberto
          </Badge>
        </CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => { setEditTarget(null); setOpenDialog(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar Tarefa
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma tarefa cadastrada.
          </p>
        ) : (
          <>
            <TaskGroup title="Atrasadas" tone="overdue" items={grouped.overdue} canManage={canManage} isManager={isManager} onToggle={toggleStatus} onEdit={(t) => { setEditTarget(t); setOpenDialog(true); }} onRemove={setDeleteTarget} />
            <TaskGroup title="Hoje" tone="today" items={grouped.todayList} canManage={canManage} isManager={isManager} onToggle={toggleStatus} onEdit={(t) => { setEditTarget(t); setOpenDialog(true); }} onRemove={setDeleteTarget} />
            <TaskGroup title="Próximas" tone="upcoming" items={grouped.upcoming} canManage={canManage} isManager={isManager} onToggle={toggleStatus} onEdit={(t) => { setEditTarget(t); setOpenDialog(true); }} onRemove={setDeleteTarget} />
            <TaskGroup title="Concluídas" tone="completed" items={grouped.completed} canManage={canManage} isManager={isManager} onToggle={toggleStatus} onEdit={(t) => { setEditTarget(t); setOpenDialog(true); }} onRemove={setDeleteTarget} />
          </>
        )}
      </CardContent>

      {canManage && (
        <TaskDialog
          open={openDialog}
          onOpenChange={setOpenDialog}
          target={editTarget}
          isManager={isManager}
          isCloser={isCloser}
          myCloserId={myCloserId ?? null}
          closersList={closersList}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["tasks"] })}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa <strong>{deleteTarget?.title}</strong> será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TaskGroup({
  title, tone, items, canManage, isManager, onToggle, onEdit, onRemove,
}: {
  title: string;
  tone: "overdue" | "today" | "upcoming" | "completed";
  items: Task[];
  canManage: boolean;
  isManager: boolean;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onRemove: (t: Task) => void;
}) {
  if (items.length === 0) return null;
  const badgeCls =
    tone === "overdue" ? "bg-destructive/15 text-destructive border-destructive/30" :
    tone === "today" ? "bg-primary/15 text-primary border-primary/30" :
    tone === "completed" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
    "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
        <Badge variant="outline" className={cn("text-[10px]", badgeCls)}>{items.length}</Badge>
      </div>
      <div className="space-y-1.5">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5">
            <button
              onClick={() => onToggle(t)}
              disabled={!canManage}
              className={cn(
                "mt-0.5 shrink-0 transition-colors",
                canManage ? "cursor-pointer" : "cursor-default opacity-60",
                t.status === "concluida" ? "text-emerald-500" : "text-muted-foreground hover:text-primary"
              )}
              title={t.status === "concluida" ? "Marcar como pendente" : "Marcar como concluída"}
            >
              {t.status === "concluida" ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </button>

            <div className="flex-1 min-w-0">
              <div className={cn("text-sm font-medium", t.status === "concluida" && "line-through text-muted-foreground")}>
                {t.title}
              </div>
              {t.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {t.due_date && (
                  <span className="text-[11px] text-muted-foreground">
                    {format(parseISO(t.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    {t.due_time && ` · ${t.due_time}`}
                  </span>
                )}
                {isManager && t.closers?.name && (
                  <Badge variant="secondary" className="text-[10px]">{t.closers.name}</Badge>
                )}
              </div>
            </div>

            {canManage && (
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(t)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onRemove(t)} title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Dialog ─────────────────────────────────────────────────── */
function TaskDialog({
  open, onOpenChange, target, isManager, isCloser, myCloserId, closersList, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: Task | null;
  isManager: boolean;
  isCloser: boolean;
  myCloserId: string | null;
  closersList: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!target;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState("");
  const [assignedCloserId, setAssignedCloserId] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (target) {
      setTitle(target.title);
      setDescription(target.description ?? "");
      setDueDate(target.due_date ? parseISO(target.due_date) : undefined);
      setDueTime(target.due_time ?? "");
      setAssignedCloserId(target.assigned_closer_id ?? "none");
    } else {
      setTitle("");
      setDescription("");
      setDueDate(undefined);
      setDueTime("");
      // Closer cria já atribuída a si mesmo por padrão
      setAssignedCloserId(isCloser && myCloserId ? myCloserId : "none");
    }
  }, [open, target, isCloser, myCloserId]);

  const canSubmit = title.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        due_time: dueTime || null,
        assigned_closer_id: assignedCloserId === "none" ? null : assignedCloserId,
      };

      if (isEdit && target) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", target.id);
        if (error) throw error;
        await logAudit("tarefa_atualizada", "task", target.id, { title: title.trim() });
        toast.success("Tarefa atualizada.");
      } else {
        const { data, error } = await supabase
          .from("tasks")
          .insert({ ...payload, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit("tarefa_criada", "task", data.id, { title: title.trim() });
        toast.success("Tarefa criada.");
      }
      onDone();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar tarefa.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados da tarefa." : "Adicione uma nova tarefa ao acompanhamento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Título *</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Descrição</Label>
            <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Data prevista</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: ptBR }) : "Sem data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} locale={ptBR} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-time">Horário</Label>
              <Input id="task-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>

          {isManager && (
            <div className="space-y-1.5">
              <Label>Atribuir a</Label>
              <Select value={assignedCloserId} onValueChange={setAssignedCloserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem atribuição —</SelectItem>
                  {closersList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
