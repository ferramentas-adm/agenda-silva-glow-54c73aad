import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";

const DEFAULT_REASONS = [
  "Imprevisto do lead",
  "Sem motivo explícito",
  "Desistiu",
  "Sem closer disponível",
  "Outros",
];

const OTHER_OPTION = "Outros";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  loading?: boolean;
}

export default function CancelReasonDialog({ open, onOpenChange, leadName, onConfirm, loading }: Props) {
  const { items, isLoading } = useAppSettingList(APP_SETTING_KEYS.cancellation_reasons, DEFAULT_REASONS);
  const [option, setOption] = useState("");
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOption("");
      setOtherText("");
      setError(null);
    }
  }, [open]);

  const isOther = option === OTHER_OPTION;

  const handleSubmit = async () => {
    if (!option) {
      setError("Selecione o motivo do cancelamento.");
      return;
    }
    if (isOther) {
      const trimmed = otherText.trim();
      if (!trimmed) {
        setError("Descreva o motivo do cancelamento.");
        return;
      }
      if (trimmed.length > 200) {
        setError("Máximo 200 caracteres.");
        return;
      }
      await onConfirm(`${OTHER_OPTION}: ${trimmed}`);
      return;
    }
    await onConfirm(option);
  };

  const canSubmit = !!option && (!isOther || !!otherText.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo do cancelamento</DialogTitle>
          <DialogDescription>
            {leadName ? <>Reunião com <strong>{leadName}</strong>. </> : null}
            Selecione o motivo do cancelamento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motivo *</Label>
            <Select value={option} onValueChange={(v) => { setOption(v); setError(null); }} disabled={isLoading}>
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione um motivo"} />
              </SelectTrigger>
              <SelectContent>
                {(items.length ? items : DEFAULT_REASONS).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isOther && (
            <div className="space-y-2">
              <Label htmlFor="cancel-reason-other">Descreva o motivo *</Label>
              <Input
                id="cancel-reason-other"
                autoFocus
                maxLength={200}
                placeholder="Ex.: lead pediu para remarcar via WhatsApp..."
                value={otherText}
                onChange={(e) => { setOtherText(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
              />
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading || !canSubmit}>
            {loading ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
