import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Send, Search, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const BULK_URL_KEY = "datacrazy_bulk_import_url";
const CHUNK = 25;

type PreviewItem = {
  venda_id: string;
  lead_name: string;
  lead_phone: string | null;
  closer_name: string | null;
  sdr_name: string | null;
  valor: number | null;
  closing_date: string;
};

type SendResult = { venda_id: string; ok: boolean; status?: number; error?: string };

function monthRange() {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { first, last };
}

const brl = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Envio em lote (backfill) das vendas fechadas de um período para o CRM,
 * usando uma URL de importação separada do webhook do dia a dia.
 */
export default function CrmBulkVendasPanel() {
  const queryClient = useQueryClient();
  const { first, last } = monthRange();
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [url, setUrl] = useState("");
  const [urlLoaded, setUrlLoaded] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [failures, setFailures] = useState<SendResult[]>([]);
  const [sample, setSample] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);


  useQuery({
    queryKey: ["app-setting", BULK_URL_KEY],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", BULK_URL_KEY)
        .maybeSingle();
      if (!urlLoaded) {
        setUrl(data?.value ?? "");
        setUrlLoaded(true);
      }
      return data?.value ?? "";
    },
  });

  async function saveUrl() {
    setSavingUrl(true);
    try {
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", BULK_URL_KEY)
        .maybeSingle();
      const value = url.trim();
      const { error } = existing
        ? await supabase.from("app_settings").update({ value }).eq("key", BULK_URL_KEY)
        : await supabase.from("app_settings").insert({ key: BULK_URL_KEY, value });
      if (error) throw error;
      toast.success("URL de importação salva");
      queryClient.invalidateQueries({ queryKey: ["app-setting", BULK_URL_KEY] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a URL");
    } finally {
      setSavingUrl(false);
    }
  }

  async function loadPreview() {
    setLoadingPreview(true);
    setItems(null);
    setFailures([]);
    setSentCount(0);
    setProgress(0);
    try {
      const { data, error } = await supabase.functions.invoke("crm-bulk-vendas", {
        body: { action: "preview", from, to },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setItems(((data as { items: PreviewItem[] }).items ?? []) as PreviewItem[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao pré-visualizar");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function send(ids: string[]) {
    if (!ids.length) return;
    if (!url.trim()) {
      toast.error("Configure e salve a URL de importação primeiro");
      return;
    }
    setSending(true);
    setProgress(0);
    setSentCount(0);
    setFailures([]);
    let sent = 0;
    const fails: SendResult[] = [];
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const block = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke("crm-bulk-vendas", {
          body: { action: "send", ids: block },
        });
        if (error) throw error;
        const res = data as { sent: number; results: SendResult[]; error?: string };
        if (res?.error) throw new Error(res.error);
        sent += res.sent ?? 0;
        fails.push(...(res.results ?? []).filter((r) => !r.ok));
        setSentCount(sent);
        setFailures([...fails]);
        setProgress(Math.round(((i + block.length) / ids.length) * 100));
      }
      await logAudit("crm_bulk_vendas", "venda", undefined, {
        from,
        to,
        total: ids.length,
        sent,
        failed: fails.length,
      });
      if (fails.length === 0) toast.success(`${sent} vendas enviadas ao CRM`);
      else toast.warning(`${sent} enviadas, ${fails.length} com falha`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio em lote");
    } finally {
      setSending(false);
    }
  }

  async function loadSample(ids?: string[]) {
    setLoadingSample(true);
    setSample(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-bulk-vendas", {
        body: ids?.length ? { action: "sample", ids } : { action: "sample", from, to },
      });
      if (error) throw error;
      const res = data as { payload?: unknown; error?: string };
      if (res?.error) throw new Error(res.error);
      setSample(JSON.stringify(res.payload, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar payload de teste");
    } finally {
      setLoadingSample(false);
    }
  }

  const total = items?.length ?? 0;
  const totalValor = (items ?? []).reduce((acc, i) => acc + (i.valor ?? 0), 0);


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">URL de importação do CRM</CardTitle>
          <CardDescription>
            Destino exclusivo da carga histórica. Separado do webhook de resultado de venda usado no
            dia a dia.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="bulk-url">URL</Label>
            <Input
              id="bulk-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.datacrazy.io/..."
            />
          </div>
          <Button onClick={saveUrl} disabled={savingUrl} className="gap-1.5">
            {savingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Período do lote</CardTitle>
          <CardDescription>
            Apenas vendas fechadas, atribuídas pela data de fechamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-from">De</Label>
            <Input id="bulk-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-to">Até</Label>
            <Input id="bulk-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={loadPreview} disabled={loadingPreview || sending} className="gap-1.5">
            {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Pré-visualizar
          </Button>
        </CardContent>
      </Card>

      {items && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {total} venda{total === 1 ? "" : "s"} no lote
              </CardTitle>
              <CardDescription>Total coletado: {brl(totalValor)}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => send((items ?? []).map((i) => i.venda_id))}
                disabled={sending || total === 0}
                className="gap-1.5"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar lote
              </Button>
              {failures.length > 0 && !sending && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => send(failures.map((f) => f.venda_id))}
                >
                  <RefreshCw className="h-4 w-4" />
                  Reenviar falhas ({failures.length})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(sending || sentCount > 0) && (
              <div className="space-y-1.5">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">
                  {sentCount} enviadas · {failures.length} falhas
                </p>
              </div>
            )}

            {failures.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-2 text-xs">
                <p className="mb-1 font-medium text-destructive">Falhas</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {failures.slice(0, 20).map((f) => {
                    const item = items.find((i) => i.venda_id === f.venda_id);
                    return (
                      <li key={f.venda_id}>
                        {item?.lead_name ?? f.venda_id} — {f.status ?? "erro"} {f.error ?? ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary">
                  <tr>
                    <th className="p-2 text-left">Lead</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left">Closer</th>
                    <th className="p-2 text-left">SDR</th>
                    <th className="p-2 text-right">Valor</th>
                    <th className="p-2 text-left">Fechamento</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const fail = failures.find((f) => f.venda_id === i.venda_id);
                    return (
                      <tr key={i.venda_id} className="border-t">
                        <td className="p-2">
                          {i.lead_name}
                          {fail && (
                            <Badge variant="destructive" className="ml-1.5 text-[10px]">
                              falha
                            </Badge>
                          )}
                        </td>
                        <td className="p-2">{i.lead_phone ?? "—"}</td>
                        <td className="p-2">{i.closer_name ?? "—"}</td>
                        <td className="p-2">{i.sdr_name ?? "—"}</td>
                        <td className="p-2 text-right">{brl(i.valor)}</td>
                        <td className="p-2">{i.closing_date.split("-").reverse().join("/")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
