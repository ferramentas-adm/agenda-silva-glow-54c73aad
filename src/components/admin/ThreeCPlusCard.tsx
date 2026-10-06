import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, KeyRound, Loader2, PhoneCall, Play, Save, FlaskConical } from "lucide-react";
import { toast } from "sonner";

const KEYS = ["threec_enabled", "threec_campaign_id", "threec_list_id"] as const;
const todayBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const dtBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const RESULT_LABEL: Record<string, string> = {
  enviado: "Enviado",
  simulado: "Simulado",
  ignorado_reuniao_futura: "Tem reunião futura",
  telefone_invalido: "Telefone inválido",
  ja_enviado: "Já enviado antes",
  erro_api: "Erro na 3C Plus",
};

type Run = {
  id: string; run_date: string; kind: string; status: string; total: number; sent: number;
  skipped_future: number; skipped_invalid: number; skipped_duplicate: number; failed: number;
  dry_run: boolean; triggered_by_name: string | null; error: string | null; started_at: string;
};

function RunItems({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["threec-items", runId],
    queryFn: async () => {
      const { data } = await supabase.from("threec_run_items").select("id, lead_name, telefone, result, status_code").eq("run_id", runId).order("created_at");
      return data ?? [];
    },
  });
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin m-2" />;
  if (!data?.length) return <p className="text-xs text-muted-foreground p-2">Nenhum lead neste envio.</p>;
  return (
    <div className="max-h-64 overflow-auto text-xs">
      {data.map((i) => (
        <div key={i.id} className="flex justify-between gap-2 border-b border-border py-1 px-2">
          <span className="truncate">{i.lead_name} · {i.telefone}</span>
          <span className={i.result === "enviado" ? "text-primary" : i.result === "erro_api" ? "text-destructive" : "text-muted-foreground"}>
            {RESULT_LABEL[i.result] ?? i.result}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ThreeCPlusCard() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [campaign, setCampaign] = useState("322695");
  const [list, setList] = useState("4945922");
  const [date, setDate] = useState(todayBRT());
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<null | "dry" | "real">(null);
  const [open, setOpen] = useState<string | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["threec-config"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("key, value").in("key", KEYS as unknown as string[]);
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    },
  });
  useEffect(() => {
    if (!cfg) return;
    setEnabled(cfg.threec_enabled === "true");
    if (cfg.threec_campaign_id) setCampaign(cfg.threec_campaign_id);
    if (cfg.threec_list_id) setList(cfg.threec_list_id);
  }, [cfg]);

  const { data: runs } = useQuery({
    queryKey: ["threec-runs"],
    queryFn: async () => {
      const { data } = await supabase.from("threec_runs").select("*").order("started_at", { ascending: false }).limit(30);
      return (data ?? []) as Run[];
    },
  });

  const save = async (patch?: Partial<Record<(typeof KEYS)[number], string>>) => {
    setSaving(true);
    const values = { threec_enabled: String(enabled), threec_campaign_id: campaign.trim(), threec_list_id: list.trim(), ...patch };
    const rows = Object.entries(values).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Configuração salva");
    qc.invalidateQueries({ queryKey: ["threec-config"] });
  };

  const run = async (dry: boolean) => {
    if (!dry && !confirm(`Enviar para a 3C Plus os no-shows de ${dateBR(date)}?`)) return;
    setRunning(dry ? "dry" : "real");
    const { data, error } = await supabase.functions.invoke("threec-noshow-sync", { body: { date, dry_run: dry } });
    setRunning(null);
    qc.invalidateQueries({ queryKey: ["threec-runs"] });
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Falha no envio");
    toast.success(
      dry
        ? `Simulação: ${data.eligible} seriam enviados · ${data.skipped_future} com reunião futura`
        : `${data.sent} enviados · ${data.skipped_future} com reunião futura · ${data.failed} com erro`,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Integração 3C Plus</CardTitle>
        <CardDescription>
          Todo dia às 23:59 os leads que não compareceram e não têm nenhuma reunião futura vão para a lista da discadora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Envio automático diário (23:59)</p>
            <p className="text-xs text-muted-foreground">{enabled ? "Ligado" : "Desligado"}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); save({ threec_enabled: String(v) }); }} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>ID da Campanha</Label><Input value={campaign} onChange={(e) => setCampaign(e.target.value)} /></div>
          <div className="space-y-1"><Label>ID da Lista</Label><Input value={list} onChange={(e) => setList(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Token da API</Label>
            <div className="flex items-center gap-2 h-10 rounded-md border border-border px-3 text-sm text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" /> ••••••••••••  <Badge variant="secondary" className="ml-auto">Guardado</Badge>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </Button>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium">Envio manual</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label>Dia</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
            <Button variant="outline" size="sm" onClick={() => run(true)} disabled={!!running}>
              {running === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Simular
            </Button>
            <Button size="sm" onClick={() => run(false)} disabled={!!running}>
              {running === "real" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Enviar agora
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">"Simular" mostra quem seria enviado sem mandar nada. Um mesmo telefone nunca é enviado duas vezes.</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Histórico</p>
          {!runs?.length && <p className="text-xs text-muted-foreground">Nenhum envio ainda.</p>}
          {runs?.map((r) => (
            <div key={r.id} className="rounded-md border border-border">
              <button className="w-full flex flex-wrap items-center gap-2 p-2 text-left text-xs" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="font-medium">{dateBR(r.run_date)}</span>
                <Badge variant={r.status === "error" ? "destructive" : "secondary"}>
                  {r.dry_run ? "Simulação" : r.kind === "auto" ? "Automático" : "Manual"}
                </Badge>
                <span>{r.total} faltaram</span>·<span>{r.sent} enviados</span>·<span>{r.skipped_future} com reunião futura</span>
                {r.skipped_duplicate > 0 && <>·<span>{r.skipped_duplicate} já enviados</span></>}
                {r.skipped_invalid > 0 && <>·<span>{r.skipped_invalid} sem telefone válido</span></>}
                {r.failed > 0 && <>·<span className="text-destructive">{r.failed} com erro</span></>}
                <span className="ml-auto text-muted-foreground">{dtBR(r.started_at)}{r.triggered_by_name ? ` · ${r.triggered_by_name}` : ""}</span>
              </button>
              {r.error && <p className="px-2 pb-2 text-xs text-destructive">{r.error}</p>}
              {open === r.id && <RunItems runId={r.id} />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
