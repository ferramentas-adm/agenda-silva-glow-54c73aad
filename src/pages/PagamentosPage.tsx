import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isBefore, isToday, eachWeekOfInterval, addDays, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import {
  Wallet, Plus, Pencil, Trash2, Loader2, CalendarIcon, Filter, X,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCan } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

import AppLayout from "@/components/AppLayout";

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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { logAudit } from "@/services/auditLog";

interface Pagamento {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  valor_previsto: number;
  valor_realizado: number | null;
  valor_apresentado: number | null;
  data_prevista: string;
  data_pagamento: string | null;
  status: string;
  metodo: string | null;
  observacoes: string | null;
  closer_id: string | null;
  agendamento_id: string | null;
  venda_id: string | null;
  created_by: string;
  created_at: string;
  closers?: { name: string } | null;
}

const formatBRL = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return "";
  const padded = cleaned.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const cents = padded.slice(-2);
  return `${reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
};
const digitsToNumber = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return 0;
  return parseInt(cleaned, 10) / 100;
};
const numberToBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente:  { label: "Pendente",  cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  pago:      { label: "Pago",      cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  atrasado:  { label: "Atrasado",  cls: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
};

function computeEffectiveStatus(p: Pagamento): string {
  if (p.status === "pago" || p.status === "cancelado") return p.status;
  const dueDate = parseISO(p.data_prevista);
  if (isBefore(dueDate, new Date()) && !isToday(dueDate)) return "atrasado";
  return "pendente";
}

export default function PagamentosPage() {
  const { user } = useAuth();
  const canView = useCan("view_payments");
  const canManage = useCan("manage_payments");
  const queryClient = useQueryClient();

  const [openDialog, setOpenDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Pagamento | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pagamento | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filtros
  const [filterCloser, setFilterCloser] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const todayDate = startOfDay(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const filterFrom = dateRange?.from;
  const filterTo = dateRange?.to ?? dateRange?.from;

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ["pagamentos"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos")
        .select("*, closers ( name )")
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Pagamento[];
    },
  });

  const { data: closersList = [] } = useQuery({
    queryKey: ["pagamentos-closers"],
    enabled: canView,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return pagamentos.filter((p) => {
      if (filterCloser !== "all" && p.closer_id !== filterCloser) return false;
      const eff = computeEffectiveStatus(p);
      if (filterStatus !== "all" && eff !== filterStatus) return false;
      if (filterFrom && parseISO(p.data_prevista) < filterFrom) return false;
      if (filterTo && parseISO(p.data_prevista) > filterTo) return false;
      return true;
    });
  }, [pagamentos, filterCloser, filterStatus, filterFrom, filterTo]);

  // Agrupa pagamentos por dia (chave = data_prevista YYYY-MM-DD)
  const groupedByDay = useMemo(() => {
    const map = new Map<string, Pagamento[]>();
    for (const p of filtered) {
      const key = p.data_prevista;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([dateKey, items]) => {
        const totalPrev = items.reduce((s, p) => s + Number(p.valor_previsto ?? 0), 0);
        const totalReal = items.reduce(
          (s, p) => s + (computeEffectiveStatus(p) === "pago" ? Number(p.valor_realizado ?? p.valor_previsto ?? 0) : 0),
          0,
        );
        return { dateKey, items, totalPrev, totalReal };
      });
  }, [filtered]);

  const totals = useMemo(() => {
    let previsto = 0;
    let recebido = 0;
    let apresentado = 0;
    let atrasado = 0;
    for (const p of filtered) {
      const eff = computeEffectiveStatus(p);
      if (eff === "cancelado") continue;
      if (eff === "pago") {
        recebido += Number(p.valor_realizado ?? p.valor_previsto ?? 0);
      } else {
        previsto += Number(p.valor_previsto ?? 0);
        if (eff === "atrasado") atrasado += Number(p.valor_previsto ?? 0);
      }
      apresentado += Number(p.valor_apresentado ?? 0);
    }
    const quebra = apresentado - recebido - previsto;
    return { previsto, recebido, apresentado, atrasado, quebra };
  }, [filtered]);

  // Gráfico semanal previsto vs realizado
  const weeklyData = useMemo(() => {
    if (filtered.length === 0) return [];
    const dates = filtered.map((p) => parseISO(p.data_prevista));
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    const weeks = eachWeekOfInterval({ start: startOfMonth(min), end: endOfMonth(max) }, { weekStartsOn: 1 });
    return weeks.map((wkStart) => {
      const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
      let prev = 0;
      let real = 0;
      for (const p of filtered) {
        const d = parseISO(p.data_prevista);
        if (d < wkStart || d > wkEnd) continue;
        if (computeEffectiveStatus(p) === "pago") {
          real += Number(p.valor_realizado ?? p.valor_previsto ?? 0);
        } else if (computeEffectiveStatus(p) !== "cancelado") {
          prev += Number(p.valor_previsto ?? 0);
        }
      }
      return {
        semana: format(wkStart, "dd/MM", { locale: ptBR }),
        Previsto: Math.round(prev),
        Realizado: Math.round(real),
      };
    });
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("pagamentos").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      await logAudit("pagamento_excluido", "pagamento", deleteTarget.id, {
        cliente: deleteTarget.cliente_nome,
        valor: deleteTarget.valor_previsto,
      });
      toast.success("Pagamento excluído.");
      queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
      setDeleteTarget(null);
    }
    setDeleting(false);
  };

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Pagamentos
            </h1>
            <p className="text-sm text-muted-foreground">
              Controle de recebíveis e fluxo de caixa.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => { setEditTarget(null); setOpenDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Pagamento
            </Button>
          )}
        </header>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Previsto"
            value={numberToBRL(totals.previsto)}
            icon={Clock}
            tone="amber"
          />
          <MetricCard
            label="Recebido"
            value={numberToBRL(totals.recebido)}
            icon={CheckCircle2}
            tone="emerald"
          />
          <MetricCard
            label="Atrasado"
            value={numberToBRL(totals.atrasado)}
            icon={AlertTriangle}
            tone="destructive"
          />
          <MetricCard
            label="Quebra de Expectativa"
            value={numberToBRL(totals.quebra)}
            icon={totals.quebra >= 0 ? TrendingUp : TrendingDown}
            tone={totals.quebra >= 0 ? "emerald" : "destructive"}
            description="Apresentado vs realizado"
          />
        </div>

        {/* Gráfico */}
        {weeklyData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Previsto vs Realizado por semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  Previsto:  { label: "Previsto",  color: "hsl(var(--primary))" },
                  Realizado: { label: "Realizado", color: "hsl(142 76% 45%)" },
                }}
                className="h-[260px] w-full"
              >
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Previsto" fill="var(--color-Previsto)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Realizado" fill="var(--color-Realizado)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mr-1">
                <Filter className="h-4 w-4" />
                Filtros
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs">De</Label>
                <DatePickerField value={filterFrom} onChange={setFilterFrom} />
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs">Até</Label>
                <DatePickerField value={filterTo} onChange={setFilterTo} />
              </div>

              <div className="min-w-[160px]">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[180px]">
                <Label className="text-xs">Closer</Label>
                <Select value={filterCloser} onValueChange={setFilterCloser}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {closersList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(filterCloser !== "all" || filterStatus !== "all" || filterFrom || filterTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterCloser("all"); setFilterStatus("all"); setFilterFrom(undefined); setFilterTo(undefined); }} className="h-9">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar
                </Button>
              )}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {filtered.length} pagamento{filtered.length !== 1 ? "s" : ""}
            </div>
          </CardContent>
        </Card>

        {/* Seções por dia */}
        {isLoading ? (
          <Card>
            <CardContent className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              Nenhum pagamento encontrado.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {groupedByDay.map(({ dateKey, items, totalPrev, totalReal }) => {
              const d = parseISO(dateKey);
              const isDayToday = isToday(d);
              const isPast = isBefore(d, new Date()) && !isDayToday;
              return (
                <Card key={dateKey}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className={cn(
                        "h-4 w-4",
                        isDayToday ? "text-primary" : isPast ? "text-destructive" : "text-muted-foreground",
                      )} />
                      <CardTitle className="text-base capitalize">
                        {format(d, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </CardTitle>
                      {isDayToday && (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                          Hoje
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{items.length} pagamento{items.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>Previsto: <strong className="text-foreground">{numberToBRL(totalPrev)}</strong></span>
                      <span>·</span>
                      <span>Recebido: <strong className="text-emerald-600 dark:text-emerald-400">{numberToBRL(totalReal)}</strong></span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lead</TableHead>
                            <TableHead>Closer</TableHead>
                            <TableHead className="text-right">Previsto</TableHead>
                            <TableHead className="text-right">Realizado</TableHead>
                            <TableHead>Status</TableHead>
                            {canManage && <TableHead className="text-right">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((p) => {
                            const eff = computeEffectiveStatus(p);
                            const meta = STATUS_META[eff] ?? STATUS_META.pendente;
                            return (
                              <TableRow key={p.id} className="align-top">
                                <TableCell className="font-medium">
                                  <div>{p.cliente_nome}</div>
                                  {p.observacoes && (
                                    <p className="mt-1 text-xs font-normal text-muted-foreground whitespace-pre-wrap break-words max-w-[320px]">
                                      {p.observacoes}
                                    </p>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {p.closers?.name ?? "—"}
                                </TableCell>
                                <TableCell className="text-right text-sm">{numberToBRL(Number(p.valor_previsto))}</TableCell>
                                <TableCell className="text-right text-sm">
                                  {p.valor_realizado != null ? numberToBRL(Number(p.valor_realizado)) : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn("text-xs", meta.cls)}>
                                    {meta.label}
                                  </Badge>
                                </TableCell>
                                {canManage && (
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditTarget(p); setOpenDialog(true); }}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(p)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {canManage && (
          <PagamentoDialog
            open={openDialog}
            onOpenChange={setOpenDialog}
            target={editTarget}
            closersList={closersList}
            onDone={() => queryClient.invalidateQueries({ queryKey: ["pagamentos"] })}
          />
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
              <AlertDialogDescription>
                O pagamento de <strong>{deleteTarget?.cliente_nome}</strong> ({numberToBRL(Number(deleteTarget?.valor_previsto ?? 0))}) será excluído permanentemente.
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
      </div>
    </AppLayout>
  );
}

/* ─── DatePicker compacto ────────────────────────────────────── */
function DatePickerField({ value, onChange }: { value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : "Qualquer"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} locale={ptBR} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

/* ─── Métrica ────────────────────────────────────────────────── */
function MetricCard({
  label, value, icon: Icon, tone, description,
}: {
  label: string; value: string;
  icon: typeof Wallet;
  tone: "amber" | "emerald" | "destructive" | "primary";
  description?: string;
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "amber" ? "text-amber-600 dark:text-amber-400" :
    tone === "destructive" ? "text-destructive" :
    "text-primary";

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className={cn("h-4 w-4", toneCls)} />
        </div>
        <p className={cn("text-xl font-bold mt-1", toneCls)}>{value}</p>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </CardContent>
    </Card>
  );
}

/* ─── Dialog de criar/editar ─────────────────────────────────── */
function PagamentoDialog({
  open, onOpenChange, target, closersList, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: Pagamento | null;
  closersList: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!target;

  const [valorPrevisto, setValorPrevisto] = useState("");
  const [dataPrevista, setDataPrevista] = useState<Date | undefined>(undefined);
  const [closerId, setCloserId] = useState<string>("none");
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sync from target when opens
  useEffect(() => {
    if (!open) return;
    if (target) {
      setValorPrevisto(Math.round(Number(target.valor_previsto) * 100).toString());
      setDataPrevista(parseISO(target.data_prevista));
      setCloserId(target.closer_id ?? "none");
      setObservacoes(target.observacoes ?? "");
    } else {
      setValorPrevisto("");
      setDataPrevista(undefined);
      setCloserId("none");
      setObservacoes("");
    }
  }, [open, target?.id]);

  const canSubmit = !!dataPrevista && digitsToNumber(valorPrevisto) > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const closerName =
        closerId !== "none"
          ? closersList.find((c) => c.id === closerId)?.name ?? "—"
          : "—";

      const payload = {
        valor_previsto: digitsToNumber(valorPrevisto),
        data_prevista: format(dataPrevista!, "yyyy-MM-dd"),
        closer_id: closerId === "none" ? null : closerId,
        observacoes: observacoes.trim() || null,
      };

      if (isEdit && target) {
        const { error } = await supabase
          .from("pagamentos")
          .update({ ...payload, updated_by: user.id })
          .eq("id", target.id);
        if (error) throw error;
        await logAudit("pagamento_atualizado", "pagamento", target.id, {
          valor: payload.valor_previsto,
        });
        toast.success("Pagamento atualizado.");
      } else {
        // cliente_nome é NOT NULL no schema — usamos o closer como referência.
        const { data, error } = await supabase
          .from("pagamentos")
          .insert({
            ...payload,
            cliente_nome: closerName,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        await logAudit("pagamento_criado", "pagamento", data.id, {
          valor: payload.valor_previsto,
        });
        toast.success("Pagamento registrado.");
      }
      onDone();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar pagamento.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Pagamento" : "Novo Pagamento"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados do pagamento." : "Registre um pagamento previsto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vp">Valor Previsto *</Label>
            <Input
              id="vp"
              inputMode="numeric"
              value={formatBRL(valorPrevisto)}
              onChange={(e) => setValorPrevisto(e.target.value.replace(/\D/g, ""))}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data Prevista *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dataPrevista && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataPrevista ? format(dataPrevista, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dataPrevista} onSelect={setDataPrevista} locale={ptBR} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Closer responsável</Label>
            <Select value={closerId} onValueChange={setCloserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhum —</SelectItem>
                {closersList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
          </div>
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
