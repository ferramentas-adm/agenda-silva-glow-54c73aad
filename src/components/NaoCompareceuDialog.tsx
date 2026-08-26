import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";

/** Motivos padrão de não comparecimento (editáveis em Admin > + Listas). */
export const DEFAULT_NO_SHOW_REASONS = [
  "No-show",
  "Cancelou por imprevisto pessoal",
  "Cancelou por desistência",
  "Alterou horário para o mesmo dia",
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

/**
 * Diálogo único de "Não compareceu": substitui os antigos botões
 * Cancelar / No-show / Reagendar. O status gravado é sempre `no_show`
 * e o motivo escolhido fica registrado na reunião.
 */
export default function NaoCompareceuDialog({ open, onOpenChange, leadName, onConfirm, loading }: Props) {
  const { items, isLoading } = useAppSettingList(APP_SETTING_KEYS.no_show_reasons, DEFAULT_NO_SHOW_REASONS);
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
      setError("Selecione o motivo do não comparecimento.");
      return;
    }
    if (isOther) {
      const trimmed = otherText.trim();
      if (!trimmed) {
        setError("Descreva o motivo.");
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
          <DialogTitle>Não compareceu</DialogTitle>
          <DialogDescription>
            {leadName ? <>Reunião com <strong>{leadName}</strong>. </> : null}
            Selecione o motivo do não comparecimento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="no-show-reason">Motivo *</Label>
            <Select value={option} onValueChange={(v) => { setOption(v); setError(null); }} disabled={isLoading}>
              <SelectTrigger id="no-show-reason">
                <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione um motivo"} />
              </SelectTrigger>
              <SelectContent>
                {(items.length ? items : DEFAULT_NO_SHOW_REASONS).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isOther && (
            <div className="space-y-2">
              <Label htmlFor="no-show-reason-other">Descreva o motivo *</Label>
              <Input
                id="no-show-reason-other"
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
            {loading ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
