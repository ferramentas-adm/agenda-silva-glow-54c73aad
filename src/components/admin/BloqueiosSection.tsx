import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditLog";
import { pickedDateToYMD } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default function BloqueiosSection() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-closer-blocks"],
    queryFn: async () => {
      const [blocksResult, closersResult] = await Promise.all([
        supabase.from("closer_blocks").select("id, closer_id, block_date, start_time, end_time, block_type, description, is_recurring, recurrence_weekday").order("block_date", { ascending: false }).order("start_time"),
        supabase.from("closers").select("id, name"),
      ]);
      if (blocksResult.error) throw blocksResult.error;
      if (closersResult.error) throw closersResult.error;
      return {
        blocks: (blocksResult.data ?? []) as BlockRow[],
        names: new Map((closersResult.data ?? []).map((closer) => [closer.id, closer.name])),
      };
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const weekday = date ? new Date(`${date}T12:00:00`).getDay() : null;
    return (data?.blocks ?? []).filter((block) => {
      const matchesDate = !date || (block.is_recurring ? block.recurrence_weekday === weekday : block.block_date === date);
      const haystack = `${block.description ?? ""} ${block.block_type} ${data?.names.get(block.closer_id) ?? ""}`.toLocaleLowerCase("pt-BR");
      return matchesDate && (!term || haystack.includes(term));
    });
  }, [data, date, search]);

  const selectedRows = filtered.filter((block) => selected.has(block.id));
  const allSelected = filtered.length > 0 && filtered.every((block) => selected.has(block.id));
  const toggleAll = () => setSelected((current) => allSelected ? new Set([...current].filter((id) => !filtered.some((block) => block.id === id))) : new Set([...current, ...filtered.map((block) => block.id)]));
  const toggleOne = (id: string) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const removeSelected = async () => {
    if (selectedRows.length === 0) return;
    setDeleting(true);
    try {
      const ids = selectedRows.map((block) => block.id);
      const { error } = await supabase.from("closer_blocks").delete().in("id", ids);
      if (error) throw error;
      await Promise.all(selectedRows.map((block) => logAudit("delete_closer_block", "closer_block", block.id, {
        closer_id: block.closer_id,
        closer_name: data?.names.get(block.closer_id) ?? "Closer removido",
        date: date || block.block_date,
        start_time: block.start_time,
        end_time: block.end_time,
        reason: block.block_type,
        description: block.description,
        is_recurring: block.is_recurring,
        removed_at: new Date().toISOString(),
        removal_mode: "bulk",
      })));
      ["admin-closer-blocks", "closer-blocks", "closer-blocks-day", "closer-blocks-slots", "closers-availability", "slot-counts-v2"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      setSelected(new Set());
      setConfirmOpen(false);
      toast.success(`${ids.length} bloqueio${ids.length === 1 ? " removido" : "s removidos"}`);
    } catch (error: unknown) {
      toast.error((error as Error)?.message || "Erro ao remover bloqueios");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
      <div><h3 className="flex items-center gap-2 text-base font-semibold"><CalendarOff className="h-4 w-4 text-primary" />Bloqueios</h3><p className="mt-1 text-xs text-muted-foreground">Filtre, selecione e remova compromissos das agendas.</p></div>
      <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto]">
        <Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSelected(new Set()); }} max="9999-12-31" aria-label="Filtrar por data" />
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setSelected(new Set()); }} placeholder="Buscar por descrição, motivo ou closer" className="pl-9" /></div>
        <Button variant="outline" onClick={() => { setDate(""); setSearch(""); setSelected(new Set()); }} disabled={!date && !search}>Limpar filtros</Button>
      </div>
      {date && <p className="text-xs text-muted-foreground">Exibindo bloqueios pontuais e recorrentes ativos em {pickedDateToYMD(new Date(`${date}T12:00:00`)).split("-").reverse().join("/")}.</p>}
      {isLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div> : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos os bloqueios filtrados" /><span className="text-xs font-medium text-muted-foreground">{filtered.length} bloqueio{filtered.length === 1 ? "" : "s"}</span></div>
          <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
            {filtered.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum bloqueio encontrado</p> : filtered.map((block) => (
              <label key={block.id} className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-muted/30">
                <Checkbox checked={selected.has(block.id)} onCheckedChange={() => toggleOne(block.id)} aria-label={`Selecionar bloqueio de ${data?.names.get(block.closer_id) ?? "closer"}`} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{data?.names.get(block.closer_id) ?? "Closer removido"}</span><span className="text-sm text-muted-foreground">· {block.block_type}</span>{block.is_recurring && <Badge variant="outline" className="text-[10px]">Toda {WEEKDAYS[block.recurrence_weekday ?? 0]}</Badge>}</div><p className="truncate text-xs text-muted-foreground">{block.is_recurring ? "Recorrente" : block.block_date.split("-").reverse().join("/")} · {block.start_time}–{block.end_time}{block.description ? ` · ${block.description}` : ""}</p></div>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{selectedRows.length} selecionado{selectedRows.length === 1 ? "" : "s"}</span><Button variant="destructive" className="gap-2" disabled={selectedRows.length === 0} onClick={() => setConfirmOpen(true)}><Trash2 className="h-4 w-4" />Remover selecionados</Button></div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover {selectedRows.length} bloqueio{selectedRows.length === 1 ? "" : "s"}?</AlertDialogTitle><AlertDialogDescription>Os horários selecionados voltarão a ficar disponíveis. Bloqueios recorrentes serão removidos de todas as semanas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={removeSelected} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? "Removendo..." : "Confirmar remoção"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}