import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Send, Table2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBRDateTime } from "@/lib/timezone";

type Run = {
  id: string;
  run_date: string;
  kind: string;
  status: string;
  rows: number | null;
  sheet_title: string | null;
  spreadsheet_url: string | null;
  error: string | null;
  started_at: string | null;
  triggered_by_name: string | null;
};

type Export = {
  month: string;
  spreadsheet_url: string;
  created_at: string;
};

const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const monthBR = (m: string) => m.split("-").reverse().join("/");

/** Ontem em BRT. */
function yesterdayBRT() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Exportação diária dos motivos de não fechamento para o Google Sheets:
 * uma planilha por mês, uma aba por dia.
 */
export default function SheetsMotivosCard() {
  const queryClient = useQueryClient();
  const [manualDate, setManualDate] = useState(yesterdayBRT());
  const [running, setRunning] = useState(false);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["sheets-motivos-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sheets_motivos_runs")
        .select(
          "id, run_date, kind, status, rows, sheet_title, spreadsheet_url, error, started_at, triggered_by_name",
        )
        .order("run_date", { ascending: false })
        .limit(31);
      if (error) throw error;
      return (data ?? []) as Run[];
    },
  });

  const { data: exports = [] } = useQuery({
    queryKey: ["sheets-motivos-exports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sheets_motivos_exports")
        .select("month, spreadsheet_url, created_at")
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Export[];
    },
  });

  async function trigger(date: string) {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("sheets-motivos-daily", {
        body: { date, kind: "manual" },
      });
      if (error) throw error;
      const res = data as { error?: string; rows?: number; reason?: string };
      if (res?.reason === "already_running") {
        toast.info("Já existe uma exportação em andamento. Aguarde a conclusão.");
      } else if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success(`Aba atualizada com ${res?.rows ?? 0} lead(s).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["sheets-motivos-runs"] });
      queryClient.invalidateQueries({ queryKey: ["sheets-motivos-exports"] });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="h-4 w-4" />
          Planilha de motivos de não fechamento
        </CardTitle>
        <CardDescription>
          Todo dia, depois da meia-noite (horário de Brasília), os leads que não fecharam no dia
          anterior são enviados para uma planilha do Google. É uma planilha por mês e uma aba por
          dia. Você também pode enviar ou reenviar um dia específico aqui — a aba é reescrita, sem
          duplicar linhas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="sheets-motivos-date" className="text-xs">
              Dia das reuniões
            </Label>
            <Input
              id="sheets-motivos-date"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="w-[160px]"
              disabled={running}
            />
          </div>
          <Button onClick={() => trigger(manualDate)} disabled={running || !manualDate}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar para a planilha
          </Button>
        </div>

        {exports.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Planilhas por mês</h4>
            <div className="flex flex-wrap gap-2">
              {exports.map((e) => (
                <a
                  key={e.month}
                  href={e.spreadsheet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {monthBR(e.month)}
                </a>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Últimos envios</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["sheets-motivos-runs"] })}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Atualizar
            </Button>
          </div>

          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : runs.length === 0 ? (
            <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              Nenhum envio registrado ainda. O primeiro envio automático ocorre na madrugada.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
                >
                  <span className="font-medium">{dateBR(r.run_date)}</span>
                  {r.status === "success" ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Enviado
                    </Badge>
                  ) : r.status === "running" ? (
                    <Badge variant="outline" className="gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Em andamento
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" /> Falhou
                    </Badge>
                  )}
                  <Badge variant="outline">{r.kind === "auto" ? "Automático" : "Manual"}</Badge>
                  <span className="text-muted-foreground">{r.rows ?? 0} lead(s)</span>
                  {r.spreadsheet_url && (
                    <a
                      href={r.spreadsheet_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir planilha
                    </a>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {r.started_at ? formatBRDateTime(r.started_at) : "—"}
                    {r.triggered_by_name ? ` · ${r.triggered_by_name}` : ""}
                  </span>
                  {r.error && (
                    <p className="w-full rounded bg-destructive/10 p-2 text-xs text-destructive">
                      {r.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
