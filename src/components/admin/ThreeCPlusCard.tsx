import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, KeyRound, Loader2, PhoneCall, Play, Save, FlaskConical, Plus, Pencil, Trash2, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS } from "@/lib/vendaConstants";
import { CANCEL_REASONS, NO_SHOW_REASON, SAME_DAY_RESCHEDULE_REASON } from "@/lib/noShowReasons";

const todayBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const dtBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const STATUS_OPTS = [
  { v: "no_show", l: "Não compareceu" },
  { v: "cancelada", l: "Cancelada" },
  { v: "realizada", l: "Realizada (sem venda)" },
];
const RESULT_LABEL: Record<string, string> = {
  enviado: "Enviado", simulado: "Simulado", ignorado_reuniao_futura: "Tem reunião futura",
  telefone_invalido: "Telefone inválido", ja_enviado: "Já enviado para esta lista", erro_api: "Erro na 3C Plus",
};

const COLUMN_OPTS = [
  { v: "nome_lead", l: "Nome do lead" },
  { v: "telefone", l: "Telefone (obrigatório)" },
  { v: "data_ultimo_agendamento", l: "Data da reunião" },
  { v: "status_ultimo_agendamento", l: "Status da reunião" },
  { v: "ultimo_closer", l: "Closer" },
  { v: "ultimo_sdr", l: "SDR" },
  { v: "motivo_cancelamento_ou_noshow", l: "Motivo (não compareceu / cancelada / não fechou)" },
  { v: "canal_origem", l: "Canal de origem" },
  { v: "produto_interesse", l: "Produto de interesse" },
];
const ALL_COLUMNS = COLUMN_OPTS.map((c) => c.v);
const orderCols = (cols: string[]) => ALL_COLUMNS.filter((c) => c === "telefone" || cols.includes(c));
function downloadTemplate(cols: string[], name: string) {
  const blob = new Blob(["\uFEFF" + orderCols(cols).join(";") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `modelo_3cplus_${(name || "regra").normalize("NFD").replace(/[^\w]+/g, "_").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Rule = {
  id: string; name: string; active: boolean; campaign_id: string; list_id: string; statuses: string[];
  reasons: string[]; only_no_sale: boolean; nao_fechamento_reasons: string[]; skip_future: boolean;
  dedupe: boolean; include_desqualificados: boolean; columns: string[];
};
type Run = {
  id: string; run_date: string; kind: string; status: string; total: number; sent: number;
  skipped_future: number; skipped_invalid: number; skipped_duplicate: number; failed: number;
  dry_run: boolean; triggered_by_name: string | null; error: string | null; started_at: string; rule_name: string | null;
};
const EMPTY: Omit<Rule, "id"> = {
  name: "", active: true, campaign_id: "", list_id: "", statuses: ["no_show"], reasons: [],
  only_no_sale: true, nao_fechamento_reasons: [], skip_future: true, dedupe: true, include_desqualificados: true, columns: ALL_COLUMNS,
};

function RunItems({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["threec-items", runId],
    queryFn: async () => {
      const { data } = await supabase.from("threec_run_items").select("id, lead_name, telefone, result").eq("run_id", runId).order("created_at");
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

function MultiCheck({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid sm:grid-cols-2 gap-1 max-h-44 overflow-auto rounded-md border border-border p-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={value.includes(o)} onCheckedChange={(c) => onChange(c ? [...value, o] : value.filter((x) => x !== o))} />
          {o}
        </label>
      ))}
    </div>
  );
}

function RuleDialog({ rule, onClose }: { rule: Partial<Rule> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Omit<Rule, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const noShow = useAppSettingList(APP_SETTING_KEYS.no_show_reasons, [NO_SHOW_REASON, SAME_DAY_RESCHEDULE_REASON]);
  const cancel = useAppSettingList(APP_SETTING_KEYS.cancellation_reasons, [...CANCEL_REASONS]);
  const nf = useAppSettingList(APP_SETTING_KEYS.motivos_nao_fechamento, DEFAULT_REASONS);
  useEffect(() => { if (rule) setF({ ...EMPTY, ...rule }); }, [rule]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const absentReasons = [...new Set([NO_SHOW_REASON, ...(noShow.items ?? []), ...(cancel.items ?? [])])];
  const hasAbsent = f.statuses.some((s) => s !== "realizada");
  const hasReal = f.statuses.includes("realizada");

  const save = async () => {
    if (!f.name.trim() || !f.campaign_id.trim() || !f.list_id.trim()) return toast.error("Preencha nome, campanha e lista");
    if (!f.statuses.length) return toast.error("Escolha ao menos um status");
    setSaving(true);
    const payload = { ...f, name: f.name.trim(), campaign_id: f.campaign_id.trim(), list_id: f.list_id.trim(), updated_at: new Date().toISOString() };
    const { error } = rule?.id
      ? await supabase.from("threec_rules").update(payload).eq("id", rule.id)
      : await supabase.from("threec_rules").insert(payload);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Regra salva");
    qc.invalidateQueries({ queryKey: ["threec-rules"] });
    onClose();
  };

  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>{rule?.id ? "Editar regra" : "Nova regra"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>Nome da regra</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Realizadas sem venda — Sem dinheiro" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>ID da campanha (3C Plus)</Label><Input value={f.campaign_id} onChange={(e) => set("campaign_id", e.target.value)} /></div>
            <div className="space-y-1"><Label>ID da lista (3C Plus)</Label><Input value={f.list_id} onChange={(e) => set("list_id", e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Quais reuniões entram</Label>
            <div className="flex flex-wrap gap-4">
              {STATUS_OPTS.map((s) => (
                <label key={s.v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={f.statuses.includes(s.v)} onCheckedChange={(c) => set("statuses", c ? [...f.statuses, s.v] : f.statuses.filter((x) => x !== s.v))} />
                  {s.l}
                </label>
              ))}
            </div>
          </div>
          {hasAbsent && (
            <div className="space-y-1">
              <Label>Motivos de não comparecimento / cancelamento</Label>
              <p className="text-xs text-muted-foreground">Nenhum marcado = todos os motivos.</p>
              <MultiCheck options={absentReasons} value={f.reasons} onChange={(v) => set("reasons", v)} />
            </div>
          )}
          {hasReal && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.only_no_sale} onCheckedChange={(v) => set("only_no_sale", v)} /> Só quem não comprou</label>
              <Label>Motivos de não fechamento</Label>
              <p className="text-xs text-muted-foreground">Nenhum marcado = todos os motivos.</p>
              <MultiCheck options={nf.items ?? []} value={f.nao_fechamento_reasons} onChange={(v) => set("nao_fechamento_reasons", v)} />
            </div>
          )}
          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.skip_future} onCheckedChange={(v) => set("skip_future", v)} /> Não enviar quem já tem outra reunião marcada no futuro</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.dedupe} onCheckedChange={(v) => set("dedupe", v)} /> Não enviar de novo quem já foi para esta lista</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.include_desqualificados} onCheckedChange={(v) => set("include_desqualificados", v)} /> Incluir leads da Turma B (desqualificados)</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => set("active", v)} /> Regra ativa</label>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Colunas enviadas para a 3C Plus</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate(f.columns, f.name)}>
                <Download className="h-4 w-4" /> Baixar modelo CSV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Suba o modelo na 3C Plus ao criar a lista, para as colunas baterem com o envio.</p>
            <div className="grid sm:grid-cols-2 gap-1">
              {COLUMN_OPTS.map((c) => (
                <label key={c.v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={c.v === "telefone" || f.columns.includes(c.v)} disabled={c.v === "telefone"}
                    onCheckedChange={(on) => set("columns", on ? [...f.columns, c.v] : f.columns.filter((x) => x !== c.v))} />
                  {c.l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ThreeCPlusCard() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("06:00");
  const [win, setWin] = useState("d1");
  const [date, setDate] = useState(todayBRT());
  const [ruleSel, setRuleSel] = useState("all");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<null | "dry" | "real">(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["threec-config"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("key, value").in("key", ["threec_enabled", "threec_schedule_time", "threec_window"]);
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    },
  });
  useEffect(() => {
    if (!cfg) return;
    setEnabled(cfg.threec_enabled === "true");
    if (cfg.threec_schedule_time) setTime(cfg.threec_schedule_time);
    if (cfg.threec_window) setWin(cfg.threec_window);
  }, [cfg]);

  const { data: rules } = useQuery({
    queryKey: ["threec-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("threec_rules").select("*").order("created_at");
      return (data ?? []) as Rule[];
    },
  });
  const { data: runs } = useQuery({
    queryKey: ["threec-runs"],
    queryFn: async () => {
      const { data } = await supabase.from("threec_runs").select("*").order("started_at", { ascending: false }).limit(40);
      return (data ?? []) as Run[];
    },
  });

  const saveGeneral = async () => {
    setSaving(true);
    const rows = [
      { key: "threec_enabled", value: String(enabled), updated_at: new Date().toISOString() },
      { key: "threec_window", value: win, updated_at: new Date().toISOString() },
    ];
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    const { error: e2 } = error ? { error: null } : await supabase.rpc("threec_set_schedule", { _hhmm: time });
    setSaving(false);
    if (error || e2) return toast.error("Não foi possível salvar: " + (error ?? e2)?.message);
    toast.success(`Salvo. Envio automático todo dia às ${time}`);
    qc.invalidateQueries({ queryKey: ["threec-config"] });
  };

  const toggleRule = async (r: Rule, active: boolean) => {
    await supabase.from("threec_rules").update({ active }).eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["threec-rules"] });
  };
  const removeRule = async (r: Rule) => {
    if (!confirm(`Excluir a regra "${r.name}"?`)) return;
    const { error } = await supabase.from("threec_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["threec-rules"] });
  };

  const run = async (dry: boolean) => {
    const label = ruleSel === "all" ? "todas as regras ativas" : rules?.find((r) => r.id === ruleSel)?.name;
    if (!dry && !confirm(`Enviar para a 3C Plus (${label}) os leads de ${dateBR(date)}?`)) return;
    setRunning(dry ? "dry" : "real");
    const { data, error } = await supabase.functions.invoke("threec-noshow-sync", {
      body: { date, dry_run: dry, ...(ruleSel !== "all" ? { rule_id: ruleSel } : {}) },
    });
    setRunning(null);
    qc.invalidateQueries({ queryKey: ["threec-runs"] });
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Falha no envio");
    for (const r of data.results ?? []) {
      if (r.error) toast.error(`${r.rule}: ${r.error}`);
      else toast.success(dry ? `${r.rule}: ${r.eligible} seriam enviados` : `${r.rule}: ${r.sent} enviados`);
    }
  };

  const summary = (r: Rule) => {
    const parts = r.statuses.map((s) => STATUS_OPTS.find((o) => o.v === s)?.l ?? s);
    const n = r.reasons.length + r.nao_fechamento_reasons.length;
    return parts.join(", ") + (n ? ` · ${n} motivo(s)` : " · todos os motivos");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Integração 3C Plus</CardTitle>
          <CardDescription>Todo dia, no horário escolhido, cada regra ativa envia seus leads para a campanha e lista dela.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4 items-end">
          <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} onCheckedChange={setEnabled} /> Envio automático ligado</label>
          <div className="space-y-1"><Label>Horário (Brasília)</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="space-y-1"><Label>Quais reuniões</Label>
            <Select value={win} onValueChange={setWin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="d1">Do dia anterior</SelectItem>
                <SelectItem value="d0">Do mesmo dia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveGeneral} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
          <p className="sm:col-span-4 text-xs text-muted-foreground flex items-center gap-1">
            <KeyRound className="h-3 w-3" /> O token da 3C Plus está guardado com segurança e vale para todas as campanhas.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div><CardTitle className="text-base">Regras de envio</CardTitle>
            <CardDescription>Cada regra tem seus filtros e sua própria campanha/lista.</CardDescription></div>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4" /> Nova regra</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!rules?.length && <p className="text-sm text-muted-foreground">Nenhuma regra criada.</p>}
          {rules?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-md border border-border p-3">
              <Switch checked={r.active} onCheckedChange={(v) => toggleRule(r, v)} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">Campanha {r.campaign_id} · Lista {r.list_id} · {summary(r)}</p>
              </div>
              <Button size="icon" variant="ghost" title="Duplicar" onClick={() => { const { id: _id, ...rest } = r; setEditing({ ...rest, name: r.name + " (cópia)" }); }}><Copy className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Excluir" onClick={() => removeRule(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Envio manual</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1"><Label>Dia das reuniões</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1 min-w-56"><Label>Regra</Label>
            <Select value={ruleSel} onValueChange={setRuleSel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as regras ativas</SelectItem>
                {rules?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => run(true)} disabled={!!running}>
            {running === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Simular</Button>
          <Button onClick={() => run(false)} disabled={!!running}>
            {running === "real" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Enviar agora</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {!runs?.length && <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>}
          {runs?.map((r) => (
            <div key={r.id} className="rounded-md border border-border">
              <button className="w-full flex items-center gap-2 p-2 text-sm text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium">{dateBR(r.run_date)}</span>
                <span className="truncate text-muted-foreground">{r.rule_name ?? "No-show (antigo)"}</span>
                {r.dry_run && <Badge variant="outline">Simulação</Badge>}
                {r.status === "error" && <Badge variant="destructive">Erro</Badge>}
                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                  {r.sent} enviados · {r.skipped_future} c/ reunião futura · {r.skipped_duplicate} repetidos · {r.failed} erros · {r.kind === "auto" ? "automático" : r.triggered_by_name} · {dtBR(r.started_at)}
                </span>
              </button>
              {r.error && <p className="text-xs text-destructive px-8 pb-1">{r.error}</p>}
              {open === r.id && <RunItems runId={r.id} />}
            </div>
          ))}
        </CardContent>
      </Card>

      <RuleDialog rule={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
