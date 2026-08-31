import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, LockOpen, Repeat, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pickedDateToYMD } from "@/lib/timezone";

const WEEKDAYS_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface CloserRow {
  id: string;
  name: string;
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

interface ReleaseRow {
  id: string;
  closer_id: string;
  release_date: string;
  start_time: string;
  end_time: string;
  original_block_type: string | null;
  original_description: string | null;
  original_block: Record<string, unknown> | null;
  exception_id: string | null;
  released_by_name: string | null;
  created_at: string;
}

const INVALIDATE_KEYS = [
  ["closer-blocks"],
  ["closer-blocks-day"],
  ["closer-blocks-slots"],
  ["closers-availability"],
  ["slot-counts-v2"],
  ["block-releases"],
  ["blocks-for-release"],
];

export default function LiberarHorarioPanel({ closers }: { closers: CloserRow[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [date, setDate] = useState<Date>(new Date());
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const dateStr = pickedDateToYMD(date);
  const weekday = useMemo(() => new Date(`${dateStr}T12:00:00`).getDay(), [dateStr]);

  const closerName = (id: string) => closers.find((c) => c.id === id)?.name ?? "Closer removido";

  const invalidateAll = () => {
    INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["blocks-for-release", dateStr, weekday, closerFilter],
    queryFn: async () => {
      let query = supabase
        .from("closer_blocks")
        .select("id, closer_id, block_date, start_time, end_time, block_type, description, is_recurring, recurrence_weekday")
        .or(
          `and(is_recurring.eq.false,block_date.eq.${dateStr}),and(is_recurring.eq.true,recurrence_weekday.eq.${weekday})`,
        )
        .order("start_time");
      if (closerFilter !== "all") query = query.eq("closer_id", closerFilter);
      const { data, error } = await query;
      if (error) throw error;

      const { data: exceptions } = await supabase
        .from("closer_block_exceptions")
        .select("block_id")
        .eq("exception_date", dateStr);
      const releasedIds = new Set((exceptions ?? []).map((e: any) => e.block_id));

      return ((data ?? []) as BlockRow[]).filter((b) => !releasedIds.has(b.id));
    },
  });

  const { data: releases = [] } = useQuery({
    queryKey: ["block-releases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_block_releases")
        .select("id, closer_id, release_date, start_time, end_time, original_block_type, original_description, original_block, exception_id, released_by_name, created_at")
        .is("undone_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ReleaseRow[];
    },
  });

  const registerRelease = async (block: BlockRow, exceptionId: string | null) => {
    await supabase.from("closer_block_releases").insert({
      closer_id: block.closer_id,
      release_date: dateStr,
      start_time: block.start_time,
      end_time: block.end_time,
      original_block_type: block.block_type,
      original_description: block.description ?? undefined,
      original_block: block as unknown as never,
      exception_id: exceptionId ?? undefined,
      released_by: user?.id ?? undefined,
      released_by_name:
        (user?.user_metadata?.full_name as string) || user?.email || undefined,
    });
  };


  /** Libera só nesta data: cria exceção (recorrente) ou remove o bloqueio (pontual). */
  const handleRelease = async (block: BlockRow) => {
    setBusyId(block.id);
    try {
      let exceptionId: string | null = null;
      if (block.is_recurring) {
        const { data, error } = await supabase
          .from("closer_block_exceptions")
          .insert({
            block_id: block.id,
            closer_id: block.closer_id,
            exception_date: dateStr,
            start_time: block.start_time,
            end_time: block.end_time,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        exceptionId = data?.id ?? null;
      } else {
        const { error } = await supabase.from("closer_blocks").delete().eq("id", block.id);
        if (error) throw error;
      }
      await registerRelease(block, exceptionId);
      toast.success(`Horário liberado para ${closerName(block.closer_id)}`);
      invalidateAll();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Erro ao liberar horário");
    }
    setBusyId(null);
  };

  /** Remove a recorrência por completo (todas as semanas). */
  const handleRemoveRecurrence = async (block: BlockRow) => {
    setBusyId(block.id);
    try {
      const { error } = await supabase.from("closer_blocks").delete().eq("id", block.id);
      if (error) throw error;
      await registerRelease(block, null);
      toast.success("Recorrência removida");
      invalidateAll();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Erro ao remover recorrência");
    }
    setBusyId(null);
  };

  const handleUndo = async (release: ReleaseRow) => {
    setBusyId(release.id);
    try {
      if (release.exception_id) {
        const { error } = await supabase
          .from("closer_block_exceptions")
          .delete()
          .eq("id", release.exception_id);
        if (error) throw error;
      } else {
        const original = (release.original_block ?? {}) as Partial<BlockRow>;
        const { error } = await supabase.from("closer_blocks").insert({
          closer_id: release.closer_id,
          block_date: original.block_date ?? release.release_date,
          start_time: release.start_time,
          end_time: release.end_time,
          block_type: release.original_block_type ?? "Bloqueio pessoal",
          description: release.original_description ?? null,
          is_recurring: original.is_recurring ?? false,
          recurrence_weekday: original.recurrence_weekday ?? null,
        });
        if (error) throw error;
      }
      await supabase
        .from("closer_block_releases")
        .update({ undone_at: new Date().toISOString() })
        .eq("id", release.id);
      toast.success("Liberação desfeita — bloqueio restaurado");
      invalidateAll();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Erro ao desfazer");
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl border border-primary/10 p-4">
        <div className="flex items-center gap-2">
          <LockOpen className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Liberar horário bloqueado</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha a data para ver os bloqueios ativos e liberar o horário para o closer receber reuniões.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Data</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                  <CalendarIcon className="h-4 w-4" />
                  {format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Closer</label>
            <Select value={closerFilter} onValueChange={setCloserFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os closers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os closers</SelectItem>
                {closers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : blocks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum bloqueio ativo nesta data
            </p>
          ) : (
            blocks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
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
                    {b.start_time}–{b.end_time}
                    {b.description ? ` — ${b.description}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    disabled={busyId === b.id}
                    onClick={() => handleRelease(b)}
                  >
                    <LockOpen className="h-3.5 w-3.5" />
                    {b.is_recurring ? "Liberar só neste dia" : "Liberar"}
                  </Button>
                  {b.is_recurring && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs text-destructive hover:text-destructive"
                      disabled={busyId === b.id}
                      onClick={() => handleRemoveRecurrence(b)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Remover recorrência
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl border border-primary/10 p-4">
        <h2 className="font-semibold">Liberações recentes</h2>
        <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {releases.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma liberação registrada</p>
          ) : (
            releases.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{closerName(r.closer_id)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-sm">
                      {format(new Date(`${r.release_date}T00:00:00`), "dd/MM/yyyy")} · {r.start_time}–{r.end_time}
                    </span>
                    {!r.exception_id && (
                      <Badge variant="outline" className="text-[10px]">bloqueio removido</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.original_block_type ?? "Bloqueio"}
                    {r.released_by_name ? ` — liberado por ${r.released_by_name}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn("gap-1.5 text-xs")}
                  disabled={busyId === r.id}
                  onClick={() => handleUndo(r)}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Desfazer
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
