import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Send, Search, RefreshCw, Save, FileJson, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CrmDailySyncCard from "./CrmDailySyncCard";
import SheetsMotivosCard from "./SheetsMotivosCard";



const BULK_URL_KEY = "datacrazy_bulk_import_url";
const CHUNK = 25;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();


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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());



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
    setSelected(new Set());
    setSearch("");

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
      // mantém selecionadas apenas as que falharam, para facilitar o reenvio
      const failedIds = new Set(fails.map((f) => f.venda_id));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => {
          if (failedIds.has(id)) next.add(id);
          else next.delete(id);
        });
        return next;
      });
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

  const filtered = useMemo(() => {
    const list = items ?? [];
    const q = search.trim();
    if (!q) return list;
    const nq = norm(q);
    const digits = q.replace(/\D/g, "");
    return list.filter((i) => {
      const haystack = norm(
        [i.lead_name, i.closer_name ?? "", i.sdr_name ?? ""].join(" "),
      );
      if (haystack.includes(nq)) return true;
      if (digits.length >= 3) {
        const phone = (i.lead_phone ?? "").replace(/\D/g, "");
        if (phone.includes(digits)) return true;
      }
      return false;
    });
  }, [items, search]);

  const selectedItems = (items ?? []).filter((i) => selected.has(i.venda_id));
  const selectedValor = selectedItems.reduce((acc, i) => acc + (i.valor ?? 0), 0);
  const filteredSelectedCount = filtered.filter((i) => selected.has(i.venda_id)).length;
  const allFilteredSelected = filtered.length > 0 && filteredSelectedCount === filtered.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((i) => next.delete(i.venda_id));
      else filtered.forEach((i) => next.add(i.venda_id));
      return next;
    });
  }




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
          <Button variant="secondary" onClick={() => loadSample()} disabled={loadingSample || sending} className="gap-1.5">
            {loadingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            Payload de teste
          </Button>
        </CardContent>
      </Card>

      {sample && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Payload de teste (não enviado)</CardTitle>
              <CardDescription>
                Estrutura exata de cada requisição POST do lote. Use para mapear os campos no CRM.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(sample);
                  toast.success("Payload copiado");
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSample(null)}>
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              {sample}
            </pre>
          </CardContent>
        </Card>
      )}


      {items && (
        <Card>
          <CardHeader className="flex flex-col items-start justify-between gap-3 lg:flex-row">
            <div>
              <CardTitle className="text-base">
                {total} venda{total === 1 ? "" : "s"} no lote
              </CardTitle>
              <CardDescription>
                Total coletado: {brl(totalValor)}
                {selected.size > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">
                      {selected.size} selecionada{selected.size === 1 ? "" : "s"} ·{" "}
                      {brl(selectedValor)}
                    </span>
                  </>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const firstId = selectedItems[0]?.venda_id ?? filtered[0]?.venda_id;
                  if (firstId) loadSample([firstId]);
                }}
                disabled={loadingSample || sending || total === 0}
                className="gap-1.5"
              >
                {loadingSample ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileJson className="h-4 w-4" />
                )}
                Payload de teste
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const firstId = selectedItems[0]?.venda_id ?? items?.[0]?.venda_id;
                  if (firstId) send([firstId]);
                }}
                disabled={sending || total === 0}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                Enviar 1 teste
              </Button>
              <Button
                onClick={() => send(selectedItems.map((i) => i.venda_id))}
                disabled={sending || selected.size === 0}
                className="gap-1.5"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar selecionadas ({selected.size})
              </Button>
              <Button
                variant="outline"
                onClick={() => send((items ?? []).map((i) => i.venda_id))}
                disabled={sending || total === 0}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                Enviar lote
              </Button>

              {selected.size > 0 && !sending && (
                <Button variant="ghost" className="gap-1.5" onClick={() => setSelected(new Set())}>
                  <X className="h-4 w-4" />
                  Limpar seleção
                </Button>
              )}

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
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por lead, telefone, closer ou SDR..."
                className="pl-8"
              />
            </div>

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
                    <th className="w-9 p-2 text-left">
                      <Checkbox
                        checked={
                          allFilteredSelected
                            ? true
                            : filteredSelectedCount > 0
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={toggleAllFiltered}
                        disabled={sending || filtered.length === 0}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th className="p-2 text-left">Lead</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left">Closer</th>
                    <th className="p-2 text-left">SDR</th>
                    <th className="p-2 text-right">Valor</th>
                    <th className="p-2 text-left">Fechamento</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-muted-foreground">
                        Nenhuma venda encontrada.
                      </td>
                    </tr>
                  )}
                  {filtered.map((i) => {
                    const fail = failures.find((f) => f.venda_id === i.venda_id);
                    const isSelected = selected.has(i.venda_id);
                    return (
                      <tr
                        key={i.venda_id}
                        className={`cursor-pointer border-t ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => !sending && toggleOne(i.venda_id)}
                      >
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(i.venda_id)}
                            disabled={sending}
                            aria-label={`Selecionar ${i.lead_name}`}
                          />
                        </td>
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

      <CrmDailySyncCard />

      <SheetsMotivosCard />

    </div>
  );
}

