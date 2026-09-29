import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { Textarea } from "@/components/ui/textarea";

/** "18 min" / "1h 05min". */
const formatDuracao = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;

const horaBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Motivos padrão de não comparecimento (editáveis em Admin > + Listas). */
export const DEFAULT_NO_SHOW_REASONS = [
  "No-show",
  "Cancelou por imprevisto pessoal",
  "Cancelou por desistência",
  "Não acompanhado pelo SDR",
  "Sem closer disponível",
  "Alterou horário para o mesmo dia",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName?: string;
  /** Quando informado, checamos a auditoria da Torre de Controle desta reunião. */
  agendamentoId?: string | null;
  onConfirm: (reason: string, note?: string) => Promise<void> | void;
  loading?: boolean;
}

/**
 * Diálogo único de "Não compareceu": substitui os antigos botões
 * Cancelar / No-show / Reagendar. O status gravado é sempre `no_show`
 * e o motivo escolhido fica registrado na reunião.
 */
export default function NaoCompareceuDialog({ open, onOpenChange, leadName, agendamentoId, onConfirm, loading }: Props) {
  const { items, isLoading } = useAppSettingList(APP_SETTING_KEYS.no_show_reasons, DEFAULT_NO_SHOW_REASONS);
  const [option, setOption] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Double-check da Torre de Controle: se o Google Meet registrou lead e closer
  // juntos na sala, marcar "Não compareceu" contraria a leitura oficial.
  const { data: torre } = useQuery({
    queryKey: ["torre-auditoria", agendamentoId],
    enabled: open && !!agendamentoId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("agendamentos")
        .select("torre_presenca_confirmada, torre_primeira_deteccao_at, torre_tempo_juntos_minutos")
        .eq("id", agendamentoId as string)
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  useEffect(() => {
    if (open) {
      setOption("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!option) {
      setError("Selecione o motivo do não comparecimento.");
      return;
    }
    await onConfirm(option, note.trim() || undefined);
  };

  const canSubmit = !!option;

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
          {torre?.torre_presenca_confirmada && (
            <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">
                  A Torre de Controle registrou o lead e o closer juntos na sala
                  {torre.torre_primeira_deteccao_at ? ` às ${horaBR(torre.torre_primeira_deteccao_at)}` : ""}
                  {typeof torre.torre_tempo_juntos_minutos === "number"
                    ? `, por ${formatDuracao(torre.torre_tempo_juntos_minutos)}`
                    : ""}
                  .
                </p>
                <p>
                  Se o lead entrou e precisou sair, o correto é marcar a reunião como <strong>Realizada</strong> e
                  informar o motivo <strong>"Cliente precisou sair"</strong>.
                </p>
              </div>
            </div>
          )}
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
          <div className="space-y-2">
            <Label htmlFor="no-show-note">Justificativa (opcional)</Label>
            <Textarea
              id="no-show-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalhe o que o lead informou (enriquecimento de dados)"
              rows={3}
            />
          </div>
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
