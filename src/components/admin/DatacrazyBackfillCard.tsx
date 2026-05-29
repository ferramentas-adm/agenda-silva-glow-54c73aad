import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, FlaskConical, Eye } from "lucide-react";
import { toast } from "sonner";

interface RunStats {
  total: number;
  sent: number;
  failed: number;
  errors: { agendamento_id: string; error: string }[];
}

export default function DatacrazyBackfillCard() {
  const [startDate, setStartDate] = useState("2026-05-01");
  const [endDate, setEndDate] = useState("");
  const [onlyMotivo, setOnlyMotivo] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState<RunStats | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (s: string) =>
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString("pt-BR")}] ${s}`].slice(-50));

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("datacrazy-backfill-vendas", { body });
    if (error) throw new Error(error.message);
    return data as any;
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await invoke({
        start_date: startDate,
        end_date: endDate || undefined,
        only_with_motivo: onlyMotivo,
        dry_run: true,
      });
      appendLog(`Pré-visualização: ${res.total} vendas seriam enviadas.`);
      toast.success(`${res.total} vendas no filtro atual.`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao pré-visualizar");
    } finally {
      setPreviewing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await invoke({
        start_date: startDate,
        end_date: endDate || undefined,
        only_with_motivo: onlyMotivo,
        limit: 1,
        chunk_size: 1,
      });
      appendLog(`Teste: enviado=${res.sent}, falhou=${res.failed}.`);
      if (res.sent > 0) toast.success("1 registro de teste enviado ao DataCrazy.");
      else toast.error(`Falhou: ${res.errors?.[0]?.error ?? "sem dados"}`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha no envio de teste");
    } finally {
      setTesting(false);
    }
  };

  const handleRunAll = async () => {
    if (!confirm("Confirma o reenvio em lote? Pode levar vários minutos.")) return;
    setRunning(true);
    setProgress(null);
    setLog([]);
    appendLog("Iniciando backfill em lote...");
    try {
      let offset = 0;
      let total = 0;
      let totalSent = 0;
      let totalFailed = 0;
      const allErrors: { agendamento_id: string; error: string }[] = [];

      while (true) {
        const res = await invoke({
          start_date: startDate,
          end_date: endDate || undefined,
          only_with_motivo: onlyMotivo,
          offset,
          chunk_size: 40,
        });
        total = res.total;
        totalSent += res.sent;
        totalFailed += res.failed;
        if (res.errors?.length) allErrors.push(...res.errors);
        offset = res.next_offset;
        setProgress({ total, sent: totalSent, failed: totalFailed, errors: allErrors.slice(0, 20) });
        appendLog(
          `Chunk: ${res.processed} processados (enviados=${res.sent}, falharam=${res.failed}). Acumulado: ${offset}/${total}.`,
        );
        if (res.done) break;
      }
      appendLog(`Concluído. Total enviado: ${totalSent}. Falhas: ${totalFailed}.`);
      toast.success(`Backfill concluído: ${totalSent} enviados, ${totalFailed} falhas.`);
    } catch (e: any) {
      appendLog(`ERRO: ${e.message ?? e}`);
      toast.error(e.message ?? "Falha no backfill");
    } finally {
      setRunning(false);
    }
  };

  const anyBusy = running || previewing || testing;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Backfill DataCrazy — vendas históricas</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Reenvia os dados de venda (motivo, explicação, observações) para o DataCrazy. Respeita o
          limite de ~90 req/min.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="bf-start" className="text-xs">Data inicial (agendamento)</Label>
          <Input
            id="bf-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={anyBusy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bf-end" className="text-xs">Data final (opcional)</Label>
          <Input
            id="bf-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={anyBusy}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="bf-motivo"
          checked={onlyMotivo}
          onCheckedChange={(v) => setOnlyMotivo(!!v)}
          disabled={anyBusy}
        />
        <Label htmlFor="bf-motivo" className="text-xs cursor-pointer">
          Somente com motivo de não fechamento preenchido
        </Label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={anyBusy}>
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Pré-visualizar
        </Button>
        <Button variant="outline" size="sm" onClick={handleTest} disabled={anyBusy}>
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          Enviar 1 teste
        </Button>
        <Button size="sm" onClick={handleRunAll} disabled={anyBusy}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Reenviar todas
        </Button>
      </div>

      {progress && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span>Total no filtro:</span>
            <span className="font-medium">{progress.total}</span>
          </div>
          <div className="flex justify-between">
            <span>Enviados:</span>
            <span className="font-medium text-green-600 dark:text-green-400">{progress.sent}</span>
          </div>
          <div className="flex justify-between">
            <span>Falhas:</span>
            <span className="font-medium text-destructive">{progress.failed}</span>
          </div>
          {progress.total > 0 && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, ((progress.sent + progress.failed) / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3 max-h-48 overflow-auto">
          <pre className="text-[11px] leading-snug whitespace-pre-wrap font-mono">
            {log.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
