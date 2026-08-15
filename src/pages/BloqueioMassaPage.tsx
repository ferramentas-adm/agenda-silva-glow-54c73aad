import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, CalendarDays, CalendarOff, Clock, Repeat, Search, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { pickedDateToYMD } from "@/lib/timezone";

const MASS_BLOCK_REASONS = [
  "Comunicado",
  "Feedback coletivo",
  "Feedback individual",
  "Reunião interna",
  "Treinamento",
  "Bloqueio pessoal",
];

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Mode = "pontual" | "recorrente";

interface CloserRow {
  id: string;
  name: string;
  email: string | null;
}

interface BlockRow {
  id: string;
  closer_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  block_type: string;
  description: string | null;
  is_recurring: boolean;
  recurrence_weekday: number | null;
}

export default function BloqueioMassaPage() {
  const { role, loading } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("pontual");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [blockType, setBlockType] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isFullDay = startTime === "09:00" && endTime === "23:00";
  const toggleFullDay = () => {
    if (isFullDay) {
      setStartTime("09:00");
      setEndTime("10:00");
    } else {
      setStartTime("09:00");
      setEndTime("23:00");
    }
  };



  const { items: savedReasons } = useAppSettingList(APP_SETTING_KEYS.block_reasons, []);
  const reasons = useMemo(() => {
    const set = new Set<string>([...MASS_BLOCK_REASONS, ...savedReasons.filter(Boolean)]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [savedReasons]);

  const { data: closers = [], isLoading: loadingClosers } = useQuery({
    queryKey: ["mass-block-closers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closers")
        .select("id, name, email")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CloserRow[];
    },
  });

  const { data: blocks = [], isLoading: loadingBlocks } = useQuery({
    queryKey: ["closer-blocks", "mass-recent"],
    queryFn: async () => {
      const today = pickedDateToYMD(new Date());
      const { data, error } = await supabase
        .from("closer_blocks")
        .select("id, closer_id, block_date, start_time, end_time, block_type, description, is_recurring, recurrence_weekday")
        .or(`is_recurring.eq.true,block_date.gte.${today}`)
        .order("is_recurring", { ascending: false })
        .order("block_date")
        .order("start_time")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as BlockRow[];
    },
  });

  const closerName = (id: string) => closers.find((c) => c.id === id)?.name ?? "Closer removido";

  const filteredClosers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return closers;
    return closers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)
    );
  }, [closers, search]);

  if (loading) {
    return (
      <AppLayout>
        <Skeleton className="h-64 w-full" />
      </AppLayout>
    );
  }
  if (role !== "gestor") return <Navigate to="/" replace />;

  const toggleCloser = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleWeekday = (day: number) =>
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));

  const allSelected = closers.length > 0 && selected.length === closers.length;

  const canSubmit =
    selected.length > 0 &&
    !!blockType &&
    startTime < endTime &&
    (mode === "pontual" ? !!date : weekdays.length > 0);

  const handleSubmit = async () => {
    if (selected.length === 0) return toast.error("Selecione ao menos um closer");
    if (!blockType) return toast.error("Selecione um motivo");
    if (startTime >= endTime) return toast.error("Horário de fim deve ser depois do início");
    if (mode === "pontual" && !date) return toast.error("Selecione a data");
    if (mode === "recorrente" && weekdays.length === 0) return toast.error("Selecione ao menos um dia da semana");

    setSubmitting(true);
    try {
      const todayStr = pickedDateToYMD(new Date());
      const rows = selected.flatMap((closerId) => {
        if (mode === "pontual") {
          return [
            {
              closer_id: closerId,
              block_date: pickedDateToYMD(date!),
              start_time: startTime,
              end_time: endTime,
              block_type: blockType,
              description: description || null,
              is_recurring: false,
              recurrence_weekday: null as number | null,
            },
          ];
        }
        return weekdays.map((wd) => ({
          closer_id: closerId,
          block_date: todayStr,
          start_time: startTime,
          end_time: endTime,
          block_type: blockType,
          description: description || null,
          is_recurring: true,
          recurrence_weekday: wd,
        }));
      });

      const { error } = await supabase.from("closer_blocks").insert(rows);
      if (error) throw error;

      toast.success(
        rows.length === 1 ? "Bloqueio criado!" : `${rows.length} bloqueios criados!`
      );
      setSelected([]);
      setDate(undefined);
      setWeekdays([]);
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["closer-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-day"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Erro ao criar bloqueios");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("closer_blocks").delete().eq("id", id);
      if (error) throw error;
      toast.success("Bloqueio removido!");
      queryClient.invalidateQueries({ queryKey: ["closer-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-day"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Erro ao remover");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/15 border border-primary/20 p-3">
            <CalendarOff className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Bloqueio em massa</h1>
            <p className="text-sm text-muted-foreground">
              Reserve a agenda de vários closers ao mesmo tempo para treinamentos, comunicados ou feedbacks.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Closers */}
          <div className="glass-card rounded-xl border border-primary/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Closers ativos</h2>
                <Badge variant="outline" className="text-[11px]">{closers.length}</Badge>
              </div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-primary"
                onClick={() => setSelected(allSelected ? [] : closers.map((c) => c.id))}
              >
                {allSelected ? "Limpar seleção" : "Selecionar todos"}
              </Button>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar closer..."
                className="pl-9"
              />
            </div>

            <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {loadingClosers ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              ) : filteredClosers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum closer encontrado</p>
              ) : (
                filteredClosers.map((c) => {
                  const active = selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCloser(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/60 bg-muted/20 hover:bg-muted/40"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          active ? "border-primary bg-primary" : "border-primary/50"
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.email ?? "—"}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Form */}
          <div className="glass-card space-y-4 rounded-xl border border-primary/10 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "pontual" ? "default" : "outline"}
                className="gap-2"
                onClick={() => setMode("pontual")}
              >
                <CalendarIcon className="h-4 w-4" />
                Pontual
              </Button>
              <Button
                type="button"
                variant={mode === "recorrente" ? "default" : "outline"}
                className="gap-2"
                onClick={() => setMode("recorrente")}
              >
                <Repeat className="h-4 w-4" />
                Recorrente
              </Button>
            </div>

            {mode === "pontual" ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy") : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return d < today;
                    }}
                    locale={ptBR}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Dias da semana
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS_SHORT.map((label, idx) => {
                    const active = weekdays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeekday(idx)}
                        className={cn(
                          "rounded-md border py-2 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Motivo</label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Horário</label>
                <Button
                  type="button"
                  size="sm"
                  variant={isFullDay ? "default" : "outline"}
                  className="h-7 gap-1.5 text-xs"
                  onClick={toggleFullDay}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Dia inteiro
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Início</label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Fim</label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            </div>


            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Treinamento de objeções"
              />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
              {selected.length === 0
                ? "Nenhum closer selecionado"
                : selected.length === 1
                  ? "1 closer selecionado"
                  : `${selected.length} closers selecionados`}
              {mode === "recorrente" && weekdays.length > 0 && (
                <> · {weekdays.length} dia(s) da semana</>
              )}
            </div>

            <Button className="w-full gap-2" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              <CalendarOff className="h-4 w-4" />
              {submitting ? "Bloqueando..." : "Bloquear agenda"}
            </Button>
          </div>
        </div>

        {/* Recentes */}
        <div className="glass-card rounded-xl border border-primary/10 p-4">
          <h2 className="font-semibold">Bloqueios recentes</h2>
          <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {loadingBlocks ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : blocks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum bloqueio ativo</p>
            ) : (
              blocks.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{closerName(b.closer_id)}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm">{b.block_type}</span>
                      {b.is_recurring && b.recurrence_weekday !== null && (
                        <Badge variant="outline" className="gap-1 border-primary/30 text-[10px] text-primary">
                          <Repeat className="h-3 w-3" />
                          Toda {WEEKDAYS_LABEL[b.recurrence_weekday]}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {!b.is_recurring && `${format(new Date(`${b.block_date}T00:00:00`), "dd/MM/yyyy")} · `}
                      {b.start_time}–{b.end_time}
                      {b.description ? ` — ${b.description}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(b.id)}
                    aria-label="Remover bloqueio"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
