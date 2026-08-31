import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Run = {
  id: string;
  run_date: string;
  kind: string;
  status: string;
  total: number | null;
  sent: number | null;
  failed: number | null;
  skipped: number | null;
  forced: boolean | null;
  started_at: string | null;
  finished_at: string | null;
  triggered_by_name: string | null;
  error: string | null;
};

type RunItem = {
  id: string;
  venda_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  closer_name: string | null;
  valor: number | null;
  ok: boolean;
  status_code: number | null;
  error: string | null;
  attempts: number | null;
  sent_at: string | null;
};

const brl = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateBR = (iso: string) => iso.split("-").reverse().join("/");

const dateTimeBR = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Ontem em BRT. */
function yesterdayBRT() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const statusMeta: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  success: { label: "Sucesso", variant: "default" },
  partial: { label: "Parcial", variant: "secondary" },
  failed: { label: "Falhou", variant: "destructive" },
  running: { label: "Em andamento", variant: "outline" },
};

/**
 * Envio automático diário (00:00 BRT) das vendas do dia anterior para o CRM,
 * com histórico de execuções, detalhamento de erros e reenvio manual.
 */
export default function CrmDailySyncCard() {
  const queryClient = useQueryClient();
  const [manualDate, setManualDate] = useState(yesterdayBRT());
  const [force, setForce] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["crm-daily-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_daily_runs")
        .select(
          "id, run_date, kind, status, total, sent, failed, skipped, forced, started_at, finished_at, triggered_by_name, error",
        )
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Run[];
    },
    refetchInterval: running ? 3000 : 60_000,
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["crm-daily-run-items", expanded],
    enabled: !!expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_daily_run_items")
        .select(
          "id, venda_id, lead_name, lead_phone, closer_name, valor, ok, status_code, error, attempts, sent_at",
        )
        .eq("run_id", expanded!)
        .order("ok", { ascending: true })
        .order("lead_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RunItem[];
    },
  });

  async function trigger(date: string, forceResend: boolean) {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-daily-vendas", {
        body: { date, force: forceResend, kind: "manual" },
      });
      if (error) throw error;
      const res = data as {
        skipped?: boolean;
        reason?: string;
        total?: number;
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (res?.reason === "already_running") {
        toast.info("Já existe um envio em andamento. Aguarde a conclusão.");
      } else if (res?.error) {
        toast.error(res.error);
      } else if ((res?.total ?? 0) === 0) {
        toast.info("Nenhuma venda pendente de envio para essa data.");
      } else {
        toast.success(`Envio concluído: ${res?.sent ?? 0} enviadas, ${res?.failed ?? 0} falhas.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao disparar o envio");
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["crm-daily-runs"] });
      queryClient.invalidateQueries({ queryKey: ["crm-daily-run-items"] });
    }
  }

  const activeRun = runs.find((r) => r.status === "running");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Envio automático diário
        </CardTitle>
        <CardDescription>
          Todo dia à meia-noite (horário de Brasília) o sistema envia automaticamente as vendas
          fechadas do dia anterior (00:00–23:59) para a mesma URL de importação configurada acima.
          Abaixo você acompanha o histórico, os erros e pode gerar um envio manual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Disparo manual */}
        <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="daily-date" className="text-xs">
              Data das vendas
            </Label>
            <Input
              id="daily-date"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="w-[160px]"
              disabled={running}
            />
          </div>
          <Button onClick={() => trigger(manualDate, force)} disabled={running || !manualDate}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar vendas do dia
          </Button>
          <Button
            variant={force ? "default" : "outline"}
            onClick={() => setForce((v) => !v)}
            disabled={running}
            title="Quando ativo, reenvia também as vendas que já foram enviadas com sucesso nessa data."
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {force ? "Reenviar tudo: ligado" : "Reenviar tudo: desligado"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Sem "reenviar tudo", apenas vendas ainda não confirmadas no CRM são enviadas — evita
            duplicidade.
          </p>
        </div>

        {activeRun && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando vendas de {dateBR(activeRun.run_date)}…
              </span>
              <span className="text-muted-foreground">
                {(activeRun.sent ?? 0) + (activeRun.failed ?? 0)} / {activeRun.total ?? 0}
              </span>
            </div>
            <Progress
              value={
                activeRun.total
                  ? (((activeRun.sent ?? 0) + (activeRun.failed ?? 0)) / activeRun.total) * 100
                  : 0
              }
            />
          </div>
        )}

        {/* Histórico */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Histórico de envios</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["crm-daily-runs"] })}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Atualizar
            </Button>
          </div>

          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : runs.length === 0 ? (
            <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              Nenhum envio registrado ainda. O primeiro envio automático ocorre à meia-noite.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => {
                const meta = statusMeta[r.status] ?? { label: r.status, variant: "outline" as const };
                const isOpen = expanded === r.id;
                return (
                  <div key={r.id} className="rounded-md border">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-2 p-3 text-left text-sm hover:bg-muted/50"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span className="font-medium">{dateBR(r.run_date)}</span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <Badge variant="outline">{r.kind === "auto" ? "Automático" : "Manual"}</Badge>
                      {r.forced && <Badge variant="secondary">Reenvio total</Badge>}
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {r.sent ?? 0} enviadas
                      </span>
                      {(r.failed ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {r.failed} falhas
                        </span>
                      )}
                      {(r.skipped ?? 0) > 0 && (
                        <span className="text-muted-foreground">{r.skipped} já enviadas antes</span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {dateTimeBR(r.started_at)}
                        {r.triggered_by_name ? ` · ${r.triggered_by_name}` : ""}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t p-3">
                        {r.error && (
                          <p className="mb-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                            {r.error}
                          </p>
                        )}
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => trigger(r.run_date, false)}
                            disabled={running}
                          >
                            <Send className="mr-2 h-3.5 w-3.5" />
                            Reenviar apenas pendentes/falhas
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => trigger(r.run_date, true)}
                            disabled={running}
                          >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            Reenviar todas do dia
                          </Button>
                        </div>

                        {loadingItems ? (
                          <p className="py-3 text-center text-xs text-muted-foreground">
                            Carregando detalhes…
                          </p>
                        ) : items.length === 0 ? (
                          <p className="py-3 text-center text-xs text-muted-foreground">
                            Nenhuma venda registrada nesta execução.
                          </p>
                        ) : (
                          <div className="max-h-72 overflow-auto rounded border">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-muted">
                                <tr className="text-left">
                                  <th className="p-2">Lead</th>
                                  <th className="p-2">Closer</th>
                                  <th className="p-2 text-right">Valor</th>
                                  <th className="p-2">Resultado</th>
                                  <th className="p-2">Detalhe</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((it) => (
                                  <tr key={it.id} className="border-t">
                                    <td className="p-2">{it.lead_name ?? "—"}</td>
                                    <td className="p-2">{it.closer_name ?? "—"}</td>
                                    <td className="p-2 text-right">{brl(it.valor)}</td>
                                    <td className="p-2">
                                      {it.ok ? (
                                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Enviado
                                          {it.status_code ? ` (${it.status_code})` : ""}
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1 text-destructive">
                                          <AlertCircle className="h-3.5 w-3.5" />
                                          Falhou
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2 text-muted-foreground">
                                      {it.ok
                                        ? `${dateTimeBR(it.sent_at)} · ${it.attempts ?? 1} tentativa(s)`
                                        : it.error ?? "Erro desconhecido"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
