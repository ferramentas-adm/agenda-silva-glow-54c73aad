import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarOff, Clock, Pencil, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export interface CalendarCloserBlock {
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

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function invalidateBlocks(queryClient: ReturnType<typeof useQueryClient>) {
  ["closer-blocks", "closer-blocks-day", "closer-blocks-slots", "closers-availability", "slot-counts-v2", "admin-closer-blocks"].forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
}

export default function CloserBlockDetailsDialog({
  block,
  closerName,
  occurrenceDate,
  canEdit,
  canRemove,
  onClose,
}: {
  block: CalendarCloserBlock | null;
  closerName: string;
  occurrenceDate: string;
  canEdit: boolean;
  canRemove: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditing(false);
    setStartTime(block?.start_time ?? "");
    setEndTime(block?.end_time ?? "");
  }, [block]);

  if (!block) return null;

  const details = {
    closer_id: block.closer_id,
    closer_name: closerName,
    date: occurrenceDate,
    start_time: block.start_time,
    end_time: block.end_time,
    reason: block.block_type,
    description: block.description,
    is_recurring: block.is_recurring,
  };

  const handleSave = async () => {
    if (!startTime || !endTime || startTime >= endTime) {
      toast.error("O horário final deve ser depois do inicial");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("closer_blocks").update({ start_time: startTime, end_time: endTime }).eq("id", block.id);
      if (error) throw error;
      await logAudit("edit_closer_block", "closer_block", block.id, {
        ...details,
        old_start_time: block.start_time,
        old_end_time: block.end_time,
        new_start_time: startTime,
        new_end_time: endTime,
      });
      invalidateBlocks(queryClient);
      toast.success("Horário do bloqueio atualizado");
      onClose();
    } catch (error: unknown) {
      toast.error((error as Error)?.message || "Erro ao editar bloqueio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("closer_blocks").delete().eq("id", block.id);
      if (error) throw error;
      await logAudit("delete_closer_block", "closer_block", block.id, {
        ...details,
        removed_at: new Date().toISOString(),
      });
      invalidateBlocks(queryClient);
      toast.success("Bloqueio removido");
      setConfirmDelete(false);
      onClose();
    } catch (error: unknown) {
      toast.error((error as Error)?.message || "Erro ao remover bloqueio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5 text-primary" />Detalhes do bloqueio</DialogTitle>
            <DialogDescription>{block.is_recurring ? `Bloqueio recorrente, toda ${WEEKDAYS[block.recurrence_weekday ?? 0]}` : "Compromisso pontual"}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Closer</p><p className="mt-1 flex items-center gap-1.5 font-medium"><User className="h-3.5 w-3.5" />{closerName}</p></div>
            <div><p className="text-xs text-muted-foreground">Data</p><p className="mt-1 font-medium">{format(new Date(`${occurrenceDate}T12:00:00`), "dd/MM/yyyy")}</p></div>
            <div><p className="text-xs text-muted-foreground">Motivo</p><p className="mt-1 font-medium">{block.block_type}</p></div>
            <div><p className="text-xs text-muted-foreground">Descrição</p><p className="mt-1 font-medium">{block.description || "—"}</p></div>
          </div>
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="block-start">Início</Label><Input id="block-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="block-end">Fim</Label><Input id="block-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{block.start_time}–{block.end_time}</span></div>
          )}
          {(canEdit || canRemove) && (
            <div className="flex flex-wrap justify-end gap-2">
              {editing ? (
                <><Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button><Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar horário"}</Button></>
              ) : (
                <>
                  {canRemove && <Button variant="destructive" className="gap-2" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />Remover bloqueio</Button>}
                  {canEdit && <Button className="gap-2" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar horário</Button>}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remover bloqueio?</AlertDialogTitle><AlertDialogDescription>O horário {block.start_time}–{block.end_time} de {closerName} voltará a ficar disponível.{block.is_recurring ? " A recorrência inteira será removida." : ""}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving ? "Removendo..." : "Remover"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}