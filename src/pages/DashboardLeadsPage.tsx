import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity, Target, TrendingUp, Users, Calendar as CalendarIcon, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";

import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface LeadMetric {
  id: string;
  origem: string;
  evento: string;
  periodo: string | null;
  data_referencia: string;
  leads_iniciados: number;
  leads_finalizados: number;
  taxa_conclusao: number | null;
  enviado_em: string | null;
  received_at: string;
}

const RANGE_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "all", label: "Todo o período" },
] as const;

export default function DashboardLeadsPage() {
  const [range, setRange] = useState<string>("30");
  const [origemFilter, setOrigemFilter] = useState<string>("all");

  // range pode ser "7" | "30" | "90" | "all" | "today" | "yesterday"
  const dateBounds = useMemo(() => {
    const today = startOfDay(new Date());
    if (range === "today") return { from: today, to: today };
    if (range === "yesterday") {
      const y = subDays(today, 1);
      return { from: y, to: y };
    }
    if (range === "all") return { from: null, to: null };
    return { from: startOfDay(subDays(new Date(), Number(range))), to: null };
  }, [range]);

  const { data: metrics = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["lead-metrics", range],
    queryFn: async () => {
      let q = supabase
        .from("lead_metrics")
        .select("id, origem, evento, periodo, data_referencia, leads_iniciados, leads_finalizados, taxa_conclusao, enviado_em, received_at")
        .order("data_referencia", { ascending: false })
        .limit(500);
      if (dateBounds.from) q = q.gte("data_referencia", format(dateBounds.from, "yyyy-MM-dd"));
      if (dateBounds.to) q = q.lte("data_referencia", format(dateBounds.to, "yyyy-MM-dd"));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadMetric[];
    },
  });

  const origens = useMemo(() => {
    const set = new Set(metrics.map((m) => m.origem));
    return Array.from(set);
  }, [metrics]);

  const filtered = useMemo(() => {
    if (origemFilter === "all") return metrics;
    return metrics.filter((m) => m.origem === origemFilter);
  }, [metrics, origemFilter]);

  // ── KPIs agregados ──
  const totals = useMemo(() => {
    const iniciados = filtered.reduce((s, m) => s + (m.leads_iniciados || 0), 0);
    const finalizados = filtered.reduce((s, m) => s + (m.leads_finalizados || 0), 0);
    const taxa = iniciados > 0 ? (finalizados / iniciados) * 100 : 0;
    return { iniciados, finalizados, taxa, registros: filtered.length };
  }, [filtered]);

  // ── Série temporal (agregada por dia) ──
  const chartData = useMemo(() => {
    const byDay = new Map<string, { date: string; iniciados: number; finalizados: number }>();
    for (const m of filtered) {
      const key = m.data_referencia;
      const cur = byDay.get(key) ?? { date: key, iniciados: 0, finalizados: 0 };
      cur.iniciados += m.leads_iniciados || 0;
      cur.finalizados += m.leads_finalizados || 0;
      byDay.set(key, cur);
    }
    return Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: format(new Date(d.date + "T00:00:00"), "dd/MM", { locale: ptBR }),
        taxa: d.iniciados > 0 ? Math.round((d.finalizados / d.iniciados) * 100) : 0,
      }));
  }, [filtered]);

  // ── Por origem ──
  const byOrigem = useMemo(() => {
    const map = new Map<string, { origem: string; iniciados: number; finalizados: number }>();
    for (const m of filtered) {
      const cur = map.get(m.origem) ?? { origem: m.origem, iniciados: 0, finalizados: 0 };
      cur.iniciados += m.leads_iniciados || 0;
      cur.finalizados += m.leads_finalizados || 0;
      map.set(m.origem, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.iniciados - a.iniciados);
  }, [filtered]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard de Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Métricas agregadas recebidas de fontes externas (formulários, captação, etc.)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-card p-0.5">
              <Button
                type="button"
                variant={range === "today" ? "default" : "ghost"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setRange("today")}
              >
                Hoje
              </Button>
              <Button
                type="button"
                variant={range === "yesterday" ? "default" : "ghost"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setRange("yesterday")}
              >
                Ontem
              </Button>
            </div>

            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[200px]">
                <CalendarIcon className="h-4 w-4 mr-2 text-primary" />
                <SelectValue placeholder="Selecionar período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">
                  <span className="inline-flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" /> Hoje
                  </span>
                </SelectItem>
                <SelectItem value="yesterday">
                  <span className="inline-flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" /> Ontem
                  </span>
                </SelectItem>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {origens.length > 0 && (
              <Select value={origemFilter} onValueChange={setOrigemFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filtrar por origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {origens.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Atualizar"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Leads iniciados"
            value={totals.iniciados.toLocaleString("pt-BR")}
            tone="primary"
          />
          <KpiCard
            icon={<Target className="h-4 w-4" />}
            label="Leads finalizados"
            value={totals.finalizados.toLocaleString("pt-BR")}
            tone="success"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Taxa de conclusão"
            value={`${totals.taxa.toFixed(1)}%`}
            tone="accent"
          />
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            label="Registros recebidos"
            value={totals.registros.toLocaleString("pt-BR")}
            tone="muted"
          />
        </div>

        {/* Time series */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Evolução diária</CardTitle>
            <CardDescription>Leads iniciados vs finalizados por dia</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                Carregando…
              </div>
            ) : chartData.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <RTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="iniciados"
                      name="Iniciados"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="finalizados"
                      name="Finalizados"
                      stroke="hsl(var(--success, 142 76% 45%))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por origem */}
        {byOrigem.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Por origem</CardTitle>
              <CardDescription>Comparativo entre fontes de captação</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byOrigem} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="origem" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <RTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="iniciados" name="Iniciados" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="finalizados" name="Finalizados" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabela de eventos recentes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Eventos recebidos</CardTitle>
            <CardDescription>Histórico bruto dos webhooks</CardDescription>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead className="text-right">Iniciados</TableHead>
                      <TableHead className="text-right">Finalizados</TableHead>
                      <TableHead className="text-right">Taxa</TableHead>
                      <TableHead>Recebido em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 100).map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {format(new Date(m.data_referencia + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.origem}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.evento}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.leads_iniciados}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.leads_finalizados}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.taxa_conclusao !== null ? `${Number(m.taxa_conclusao).toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(m.received_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// ─── Subcomponentes ─────────────────────────────────────
function KpiCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "success" | "accent" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    accent: "bg-accent/10 text-accent-foreground border-accent/30",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {label}
          </span>
          <span className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md border", toneClass)}>
            {icon}
          </span>
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="h-48 flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <Activity className="h-8 w-8 mb-2 opacity-40" />
      <p>Nenhum evento de lead recebido ainda.</p>
      <p className="text-xs mt-1">Configure o projeto externo para enviar webhooks ao endpoint.</p>
    </div>
  );
}
