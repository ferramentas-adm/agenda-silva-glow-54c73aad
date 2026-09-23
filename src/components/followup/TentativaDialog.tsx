import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { logAudit } from "@/services/auditLog";
import { upsertFollowUpCalendarEvent } from "@/services/followUpCalendar";
import { pickedDateToYMD, brTodayYMD } from "@/lib/timezone";
import {
  CANAL_OPTIONS, TEMPERATURA_OPTIONS, MAX_TENTATIVAS, TENTATIVA_JUSTIFICATIVA_MIN,
} from "@/lib/followUp";
import type { FollowUpRecord } from "@/components/followup/types";

/**
 * Registra que o closer realmente fez o contato combinado.
 * Exige nova data/hora e justificativa de no mínimo 100 caracteres.
 */
export default function TentativaDialog({
  row,
  onClose,
  onDone,
}: {
  row: FollowUpRecord | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [canal, setCanal] = useState<string>("");
  const [temperatura, setTemperatura] = useState<string>("");
  const [novaData, setNovaData] = useState<Date | undefined>(undefined);
  const [novaHora, setNovaHora] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!row) return;
    setCanal(row.follow_up_canal ?? "");
    setTemperatura(row.follow_up_temperatura ?? "");
    setNovaData(undefined);
    setNovaHora("");
    setJustificativa("");
  }, [row?.id]);

  if (!row) return null;

  const proxima = (row.follow_up_tentativas ?? 0) + 1;
  const esgotou = proxima > MAX_TENTATIVAS;
  const justLen = justificativa.trim().length;
  const canSubmit =
    !esgotou && !!canal && !!temperatura && !!novaData && !!novaHora &&
    justLen >= TENTATIVA_JUSTIFICATIVA_MIN;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const dataStr = pickedDateToYMD(novaData!);

      const { error: tErr } = await supabase.from("follow_up_tentativas").insert({
        venda_id: row.id,
        agendamento_id: row.agendamento_id,
        numero: proxima,
        closer_id: row.agendamentos?.closer_id ?? null,
        canal,
        justificativa: justificativa.trim(),
        nova_data: dataStr,
        nova_hora: novaHora,
        temperatura,
        created_by: user.id,
      } as any);
      if (tErr) throw tErr;

      const { data: updated, error } = await supabase
        .from("vendas")
        .update({
          follow_up: true,
          follow_up_status: "ativo",
          follow_up_date: dataStr,
          follow_up_time: novaHora,
          follow_up_canal: canal,
          follow_up_temperatura: temperatura,
          follow_up_tentativas: proxima,
          follow_up_ultima_tentativa_em: new Date().toISOString(),
        } as any)
        .eq("id", row.id)
        .select("id");
      if (error) throw error;
      if (!updated?.length) throw new Error("A tentativa não foi salva. Tente novamente.");

      if (row.agendamentos?.closer_id) {
        const eventId = await upsertFollowUpCalendarEvent({
          closer_id: row.agendamentos.closer_id,
          lead_name: row.agendamentos.lead_name,
          lead_phone: row.agendamentos.lead_phone,
          canal,
          data: dataStr,
          hora: novaHora,
          produto: row.follow_up_produto,
          valor: row.follow_up_valor != null ? String(row.follow_up_valor) : null,
          condicoes: row.follow_up_condicoes,
          temperatura,
          tentativa: proxima,
          existing_event_id: row.follow_up_event_id,
        });
        if (eventId && eventId !== row.follow_up_event_id) {
          await supabase.from("vendas").update({ follow_up_event_id: eventId } as any).eq("id", row.id);
        }
      }

      await logAudit("follow_up_tentativa_registrada", "venda", row.agendamento_id, {
        lead_name: row.agendamentos?.lead_name,
        tentativa: proxima,
        canal,
        temperatura,
        nova_data: dataStr,
        nova_hora: novaHora,
        justificativa: justificativa.trim().slice(0, 300),
      });

      toast.success(`Tentativa ${proxima} de ${MAX_TENTATIVAS} registrada`);
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar a tentativa");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !submitting && !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar contato feito</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{row.agendamentos?.lead_name}</span> — tentativa{" "}
            {Math.min(proxima, MAX_TENTATIVAS)} de {MAX_TENTATIVAS}.
          </DialogDescription>
        </DialogHeader>

        {esgotou ? (
          <p className="text-sm text-destructive">
            As {MAX_TENTATIVAS} tentativas deste lead já foram usadas. Registre a venda ou aguarde
            a liberação dele para o Balde de Reativação.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Como você falou com o lead? *</Label>
              <div className="grid grid-cols-2 gap-2">
                {CANAL_OPTIONS.map((c) => (
                  <Button
                    key={c.value}
                    type="button"
                    variant={canal === c.value ? "default" : "outline"}
                    onClick={() => setCanal(c.value)}
                    size="sm"
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Chance de fechar agora *</Label>
              <div className="grid grid-cols-3 gap-2">
                {TEMPERATURA_OPTIONS.map((t) => (
                  <Button
                    key={t.value}
                    type="button"
                    variant={temperatura === t.value ? "default" : "outline"}
                    onClick={() => setTemperatura(t.value)}
                    size="sm"
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Nova data combinada *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !novaData && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {novaData ? format(novaData, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={novaData}
                      onSelect={setNovaData}
                      disabled={(d) => pickedDateToYMD(d) < brTodayYMD()}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tent-hora">Novo horário *</Label>
                <Input
                  id="tent-hora"
                  type="time"
                  value={novaHora}
                  onChange={(e) => setNovaHora(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tent-just">Por que haverá um novo contato? *</Label>
              <Textarea
                id="tent-just"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={5}
                placeholder="Conte o que o lead disse, o que ficou pendente e o que foi combinado para o próximo contato."
              />
              <p
                className={cn(
                  "text-xs font-medium",
                  justLen >= TENTATIVA_JUSTIFICATIVA_MIN ? "text-emerald-500" : "text-destructive",
                )}
              >
                {justLen}/{TENTATIVA_JUSTIFICATIVA_MIN} caracteres
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar tentativa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
