import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  loading?: boolean;
}

export default function CancelReasonDialog({ open, onOpenChange, leadName, onConfirm, loading }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Informe o motivo do cancelamento.");
      return;
    }
    if (trimmed.length > 200) {
      setError("Máximo 200 caracteres.");
      return;
    }
    await onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo do cancelamento</DialogTitle>
          <DialogDescription>
            {leadName ? <>Reunião com <strong>{leadName}</strong>. </> : null}
            Descreva em uma linha por que está cancelando.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Motivo *</Label>
          <Input
            id="cancel-reason"
            autoFocus
            maxLength={200}
            placeholder="Ex.: Cliente desistiu, sem interesse..."
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading || !reason.trim()}>
            {loading ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
