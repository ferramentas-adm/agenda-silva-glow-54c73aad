import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS } from "@/lib/vendaConstants";
import { logAudit } from "@/services/auditLog";

export interface FollowUpEditTarget {
  id: string;
  agendamento_id: string;
  follow_up_date: string;
  follow_up_time: string | null;
  motivo_nao_fechamento: string | null;
  observacoes: string | null;
  lead_name?: string;
}

interface Props {
  target: FollowUpEditTarget | null;
  onClose: () => void;
  onDone: () => void;
}

export default function FollowUpEditDialog({ target, onClose, onDone }: Props) {
  const { items: motivos } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );

  const [data, setData] = useState<Date | undefined>(undefined);
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!target) return;
    setData(target.follow_up_date ? parseISO(target.follow_up_date) : undefined);
    setHorario(target.follow_up_time || "");
    setMotivo(target.motivo_nao_fechamento || "");
    setObservacoes(target.observacoes || "");
  }, [target?.id]);

  if (!target) return null;

  const canSubmit = !!data && !!horario;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data: updatedVenda, error } = await supabase
        .from("vendas")
        .update({
          follow_up: true,
          follow_up_status: "ativo",
          follow_up_date: format(data!, "yyyy-MM-dd"),
          follow_up_time: horario,
          motivo_nao_fechamento: motivo || null,
          observacoes: observacoes.trim() || null,
        } as any)
        .eq("id", target.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!updatedVenda) throw new Error("O follow-up não foi atualizado. Tente novamente.");

      await logAudit("follow_up_editado", "venda", target.agendamento_id, {
        lead_name: target.lead_name,
        follow_up_date: format(data!, "yyyy-MM-dd"),
        follow_up_time: horario,
        motivo,
      });

      toast.success("Follow-up atualizado");
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar follow-up");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !submitting && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar follow-up</DialogTitle>
          <DialogDescription>
            {target.lead_name && <span className="font-medium">{target.lead_name}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !data && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {data ? format(data, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={data}
                    onSelect={setData}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-horario">Horário *</Label>
              <Input
                id="edit-horario"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-obs">Observações</Label>
            <Textarea
              id="edit-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------ Helper de remoção (apenas remove o flag follow_up) ------------ */
export async function removeFollowUp(
  vendaId: string,
  agendamentoId: string,
  leadName?: string,
): Promise<boolean> {
  try {
    const { data: updatedVenda, error } = await supabase
      .from("vendas")
      .update({
        follow_up: false,
        follow_up_date: null,
        follow_up_time: null,
        follow_up_status: "concluido",
      } as any)
      .eq("id", vendaId)
      .select("id")
      .single();
    if (error) throw error;
    if (!updatedVenda) throw new Error("O follow-up não foi removido. Tente novamente.");

    await logAudit("follow_up_removido", "venda", agendamentoId, { lead_name: leadName });
    toast.success("Lead movido para Não acompanhados");
    return true;
  } catch (err: any) {
    toast.error(err.message || "Erro ao remover follow-up");
    return false;
  }
}
