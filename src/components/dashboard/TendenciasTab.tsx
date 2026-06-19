import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Send, TrendingUp, TrendingDown, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { brTodayYMD } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ── Tipos ────────────────────────────────────────────────────────
interface AgRow {
  id: string;
  scheduled_date: string;
  status: string;
  closer_id: string | null;
  original_agendamento_id: string | null;
}
interface VendaRow {
  agendamento_id: string;
  vendeu: boolean;
  valor: number | null;
  motivo_nao_fechamento: string | null;
  follow_up: boolean;
}

interface OverviewMetrics {
  agendamentos: number;
  realizadas: number;
  no_show: number;
  canceladas: number;
  vendas: number;
  faturamento: number;
  ticket_medio: number;
  conversao: number;
  base_conv: number;
  call_interr: number;
  follow_ups: number;
  no_show_pct: number;
  cancel_pct: number;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────
function ymdAddMonths(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, d));
  return target.toISOString().slice(0, 10);
}
function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}
function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

async function fetchPeriod(start: string, end: string): Promise<OverviewMetrics> {
  const { data: ags } = await supabase
    .from("agendamentos")
    .select("id, scheduled_date, status, closer_id, original_agendamento_id")
    .is("deleted_at", null)
    .gte("scheduled_date", start)
    .lte("scheduled_date", end);
  const list = (ags ?? []) as AgRow[];
  const ids = list.map((a) => a.id);
  const vendas: VendaRow[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: vs } = await supabase
      .from("vendas")
      .select("agendamento_id, vendeu, valor, motivo_nao_fechamento, follow_up")
      .in("agendamento_id", chunk);
    vendas.push(...((vs ?? []) as VendaRow[]));
  }
  const ven = vendas.filter((v) => v.vendeu);
  const total = ven.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const callInterr = vendas.filter((v) => (v.motivo_nao_fechamento ?? "").toLowerCase().startsWith("call inter")).length;
  const realizadas = list.filter((a) => a.status === "realizada").length;
  const base = realizadas - callInterr;
  const noShow = list.filter((a) => a.status === "no_show").length;
  const cancel = list.filter((a) => a.status === "cancelada").length;
  return {
    agendamentos: list.length,
    realizadas,
    no_show: noShow,
    canceladas: cancel,
    vendas: ven.length,
    faturamento: total,
    ticket_medio: ven.length ? Math.round(total / ven.length) : 0,
    conversao: base > 0 ? (ven.length / base) * 100 : 0,
    base_conv: base,
    call_interr: callInterr,
    follow_ups: vendas.filter((v) => v.follow_up).length,
    no_show_pct: list.length ? (noShow / list.length) * 100 : 0,
    cancel_pct: list.length ? (cancel / list.length) * 100 : 0,
  };
}

// ── Métrica card ─────────────────────────────────────────────────
type Delta = { pct: number; alert: boolean; reason?: string };
function computeDelta(cur: number, prev: number, opts?: { lowerBetter?: boolean; alertOnDropPct?: number; alertOnRisePct?: number; absoluteDiff?: number; alertOnAbs?: number }): Delta {
  if (!prev && !cur) return { pct: 0, alert: false };
  const pct = prev === 0 ? 100 : ((cur - prev) / prev) * 100;
  let alert = false;
  if (opts?.absoluteDiff !== undefined && opts.alertOnAbs !== undefined) {
    const diff = cur - prev;
    if (opts.lowerBetter ? diff > opts.alertOnAbs : diff < -opts.alertOnAbs) alert = true;
  }
  if (opts?.alertOnDropPct && !opts.lowerBetter && pct < -opts.alertOnDropPct) alert = true;
  if (opts?.alertOnRisePct && opts.lowerBetter && pct > opts.alertOnRisePct) alert = true;
  return { pct, alert };
}

function ComparativoCard({ title, value, prev, format, lowerBetter, alertDrop, alertRise, suffix }: {
  title: string;
  value: number;
  prev: number;
  format: "int" | "brl" | "pct";
  lowerBetter?: boolean;
  alertDrop?: number;
  alertRise?: number;
  suffix?: string;
}) {
  const delta = computeDelta(value, prev, { lowerBetter, alertOnDropPct: alertDrop, alertOnRisePct: alertRise });
  const fmt = (v: number) =>
    format === "brl" ? formatBRL(v) :
    format === "pct" ? `${v.toFixed(1)}%` :
    v.toLocaleString("pt-BR");
  const up = delta.pct > 0.5;
  const down = delta.pct < -0.5;
  const goodDirection = lowerBetter ? down : up;
  const Icon = up ? TrendingUp : down ? TrendingDown : null;
  return (
    <Card className={cn(delta.alert && "border-destructive/60 shadow-[0_0_0_1px_hsl(var(--destructive)/0.4)]")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
          {delta.alert && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold">{fmt(value)}{suffix}</div>
        <div className="flex items-center gap-1.5 mt-1 text-xs">
          {Icon && <Icon className={cn("h-3.5 w-3.5", goodDirection ? "text-emerald-500" : "text-destructive")} />}
          <span className={cn(goodDirection ? "text-emerald-500" : down || up ? "text-destructive" : "text-muted-foreground", "font-medium")}>
            {delta.pct > 0 ? "+" : ""}{delta.pct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs mês anterior ({fmt(prev)}{suffix})</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chat ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Resuma o mês até agora",
  "Por que o ticket médio caiu?",
  "Quais closers regrediram em conversão?",
  "Que tendências negativas estão escondidas?",
];

function ChatPanel() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Carrega histórico
  useEffect(() => {
    if (!user) return;
    supabase
      .from("ai_chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setMessages(
            data
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })),
          );
        }
      });
  }, [user]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Foca textarea
  useEffect(() => { taRef.current?.focus(); }, [loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading || !user) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    const pendingId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg, { id: pendingId, role: "assistant", content: "", pending: true }]);
    setInput("");
    setLoading(true);

    // Persiste user
    await supabase.from("ai_chat_messages").insert({ user_id: user.id, role: "user", content: userMsg.content });

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("dashboard-ai-chat", {
        body: { messages: history },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      const reply: string = data?.content ?? "Sem resposta.";
      setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, content: reply, pending: false } : x)));
      await supabase.from("ai_chat_messages").insert({ user_id: user.id, role: "assistant", content: reply });
    } catch (e) {
      const msg = (e as Error).message ?? "Erro desconhecido";
      setMessages((m) => m.map((x) => (x.id === pendingId ? { ...x, content: `⚠️ ${msg}`, pending: false } : x)));
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    if (!user) return;
    if (!confirm("Limpar todo o histórico do chat?")) return;
    await supabase.from("ai_chat_messages").delete().eq("user_id", user.id);
    setMessages([]);
  };

  return (
    <Card className="flex flex-col h-[640px]">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Assistente de Análise
          </CardTitle>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="text-xs h-7">
              <RefreshCw className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Pergunte qualquer coisa sobre os dados do mês. Eu consulto o banco antes de responder.</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="text-xs h-auto py-1.5 whitespace-normal text-left" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[88%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50",
              )}>
                {m.pending ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando…
                  </div>
                ) : m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-table:my-2 prose-p:my-1 prose-headings:my-2 prose-ul:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <div className="p-3 border-t">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder="Pergunte algo sobre os dados…"
            rows={2}
            className="resize-none flex-1 min-h-[44px]"
            disabled={loading}
          />
          <Button onClick={() => send(input)} disabled={loading || !input.trim()} size="icon">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Tab principal ────────────────────────────────────────────────
export default function TendenciasTab() {
  const today = brTodayYMD();
  const mStart = monthStart(today);
  const prevYmd = ymdAddMonths(today, -1);
  const prevStart = monthStart(prevYmd);
  const prevEnd = prevYmd;

  const { data: current, isLoading: l1 } = useQuery({
    queryKey: ["tendencias-current", mStart, today],
    queryFn: () => fetchPeriod(mStart, today),
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: previous, isLoading: l2 } = useQuery({
    queryKey: ["tendencias-prev", prevStart, prevEnd],
    queryFn: () => fetchPeriod(prevStart, prevEnd),
    staleTime: 10 * 60 * 1000,
  });

  const loading = l1 || l2;
  const cur = current;
  const prv = previous;

  // Alertas extras (texto)
  const alerts = useMemo(() => {
    if (!cur || !prv) return [];
    const out: string[] = [];
    if (prv.ticket_medio > 0 && (cur.ticket_medio - prv.ticket_medio) / prv.ticket_medio < -0.15)
      out.push(`Ticket médio caiu ${Math.round(((cur.ticket_medio - prv.ticket_medio) / prv.ticket_medio) * 100)}% vs mês anterior`);
    if (cur.conversao - prv.conversao < -2)
      out.push(`Conversão caiu ${(prv.conversao - cur.conversao).toFixed(1)}pp vs mês anterior`);
    if (prv.follow_ups > 0 && (cur.follow_ups - prv.follow_ups) / prv.follow_ups > 0.5)
      out.push(`Follow-ups abertos cresceram ${Math.round(((cur.follow_ups - prv.follow_ups) / prv.follow_ups) * 100)}%`);
    if (cur.no_show_pct > 22) out.push(`No-show acima de 22% (${cur.no_show_pct.toFixed(1)}%)`);
    if (prv.call_interr > 0 && (cur.call_interr - prv.call_interr) / prv.call_interr > 0.5)
      out.push(`Call Interrompida cresceu ${Math.round(((cur.call_interr - prv.call_interr) / prv.call_interr) * 100)}%`);
    return out;
  }, [cur, prv]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tendências do Mês</h2>
        <p className="text-sm text-muted-foreground">
          {mStart} até hoje vs mesmo período do mês anterior ({prevStart} a {prevEnd}).
        </p>
      </div>

      {alerts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-destructive mb-1">Alertas</div>
                <ul className="text-sm space-y-0.5">
                  {alerts.map((a) => <li key={a}>• {a}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading || !cur || !prv ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando métricas…
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ComparativoCard title="Agendamentos" value={cur.agendamentos} prev={prv.agendamentos} format="int" />
          <ComparativoCard title="Realizadas" value={cur.realizadas} prev={prv.realizadas} format="int" />
          <ComparativoCard title="Vendas" value={cur.vendas} prev={prv.vendas} format="int" />
          <ComparativoCard title="Conversão" value={cur.conversao} prev={prv.conversao} format="pct" alertDrop={20} />
          <ComparativoCard title="Ticket Médio" value={cur.ticket_medio} prev={prv.ticket_medio} format="brl" alertDrop={15} />
          <ComparativoCard title="Faturamento" value={cur.faturamento} prev={prv.faturamento} format="brl" />
          <ComparativoCard title="No-show %" value={cur.no_show_pct} prev={prv.no_show_pct} format="pct" lowerBetter alertRise={15} suffix="" />
          <ComparativoCard title="Cancelamento %" value={cur.cancel_pct} prev={prv.cancel_pct} format="pct" lowerBetter alertRise={20} />
          <ComparativoCard title="Follow-ups abertos" value={cur.follow_ups} prev={prv.follow_ups} format="int" lowerBetter alertRise={50} />
          <ComparativoCard title="Call Interrompida" value={cur.call_interr} prev={prv.call_interr} format="int" lowerBetter alertRise={50} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Resumo
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {!loading && cur && prv && (
                <>
                  <p>
                    Mês atual fechou até agora <strong>{cur.vendas}</strong> vendas (base {cur.base_conv}, conv. <Badge variant="secondary">{cur.conversao.toFixed(1)}%</Badge>) faturando <strong>{formatBRL(cur.faturamento)}</strong>, ticket médio <strong>{formatBRL(cur.ticket_medio)}</strong>.
                  </p>
                  <p>
                    No mesmo período do mês passado: <strong>{prv.vendas}</strong> vendas, conv. <Badge variant="secondary">{prv.conversao.toFixed(1)}%</Badge>, ticket <strong>{formatBRL(prv.ticket_medio)}</strong>.
                  </p>
                  <p className="text-muted-foreground text-xs pt-2">
                    Use o chat ao lado para investigar padrões — pergunte por closer, motivo, semana, etc.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
