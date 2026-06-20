import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import {
  Activity, Target, TrendingUp, Users, Calendar as CalendarIcon, RefreshCw,
  Briefcase, Wallet, UserX,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { formatBRDateTime } from "@/lib/timezone";
import FacebookDateRangePicker, { type FBComparison } from "@/components/FacebookDateRangePicker";

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
  classificacao: string | null;
  faturamento: string | null;
  renda: string | null;
}

const RANGE_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "all", label: "Todo o período" },
] as const;

export default function DashboardLeadsPage() {
  return (
    <AppLayout>
      <LeadsDashboardContent />
    </AppLayout>
  );
}

export function LeadsDashboardContent() {
  const today = startOfDay(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: today,
    to: today,
  });
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [comparison, setComparison] = useState<FBComparison | null>(null);

  const fromDate = dateRange?.from ?? null;
  const toDate = dateRange?.to ?? dateRange?.from ?? null;

  const { data: metrics = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "lead-metrics",
      fromDate ? format(fromDate, "yyyy-MM-dd") : null,
      toDate ? format(toDate, "yyyy-MM-dd") : null,
    ],
    queryFn: async () => {
      let q = supabase
        .from("lead_metrics")
        .select("id, origem, evento, periodo, data_referencia, leads_iniciados, leads_finalizados, taxa_conclusao, enviado_em, received_at, classificacao, faturamento, renda")
        .order("data_referencia", { ascending: false })
        .limit(1000);
      if (fromDate) q = q.gte("data_referencia", format(fromDate, "yyyy-MM-dd"));
      if (toDate) q = q.lte("data_referencia", format(toDate, "yyyy-MM-dd"));
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

  // Considera apenas eventos per-lead (1 registro = 1 lead).
  // Snapshots agregados (ex.: evento "lead_finalizado" com totais como 1089/195)
  // são ignorados para evitar dupla contagem.
  const perLead = useMemo(
    () => filtered.filter((m) => m.evento === "lead_qualificado"),
    [filtered],
  );

  // ── KPIs agregados (contagem 1 a 1) ──
  const totals = useMemo(() => {
    const finalizados = perLead.length;
    let qualFat = 0, qualRenda = 0, desq = 0;
    for (const m of perLead) {
      if (m.classificacao === "qualificado_faturamento") qualFat++;
      else if (m.classificacao === "qualificado_renda") qualRenda++;
      else if (m.classificacao === "desqualificado") desq++;
    }
    // "Leads iniciados" vem do snapshot diário (evento "leads_iniciados_diario").
    // Pegamos o MAIOR valor por dia (mais recente do dia) e somamos.
    const iniciadosPorDia = new Map<string, number>();
    for (const m of filtered) {
      if (m.evento === "leads_iniciados_diario" || m.evento === "atualizacao_manual") {
        const cur = iniciadosPorDia.get(m.data_referencia) ?? 0;
        if ((m.leads_iniciados || 0) > cur) {
          iniciadosPorDia.set(m.data_referencia, m.leads_iniciados || 0);
        }
      }
    }
    const iniciados = Array.from(iniciadosPorDia.values()).reduce((s, v) => s + v, 0);
    const taxa = iniciados > 0 ? (finalizados / iniciados) * 100 : 0;
    return { iniciados, finalizados, taxa, qualFat, qualRenda, desq };
  }, [perLead, filtered]);

  // ── Série temporal (1 lead = 1 ponto) ──
  const chartData = useMemo(() => {
    const byDay = new Map<string, { date: string; iniciados: number; finalizados: number }>();
    for (const m of perLead) {
      const key = m.data_referencia;
      const cur = byDay.get(key) ?? { date: key, iniciados: 0, finalizados: 0 };
      cur.finalizados += 1;
      byDay.set(key, cur);
    }
    // Agrega "iniciados" do snapshot diário (maior valor do dia)
    const iniciadosDay = new Map<string, number>();
    for (const m of filtered) {
      if (m.evento === "leads_iniciados_diario" || m.evento === "atualizacao_manual") {
        const cur = iniciadosDay.get(m.data_referencia) ?? 0;
        if ((m.leads_iniciados || 0) > cur) {
          iniciadosDay.set(m.data_referencia, m.leads_iniciados || 0);
        }
      }
    }
    for (const [date, ini] of iniciadosDay) {
      const cur = byDay.get(date) ?? { date, iniciados: 0, finalizados: 0 };
      cur.iniciados = ini;
      byDay.set(date, cur);
    }
    return Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: format(new Date(d.date + "T00:00:00"), "dd/MM", { locale: ptBR }),
        taxa: d.iniciados > 0 ? Math.round((d.finalizados / d.iniciados) * 100) : 0,
      }));
  }, [perLead, filtered]);

  // ── Por origem (1 lead = 1 contagem) ──
  const byOrigem = useMemo(() => {
    const map = new Map<string, { origem: string; iniciados: number; finalizados: number }>();
    for (const m of perLead) {
      const cur = map.get(m.origem) ?? { origem: m.origem, iniciados: 0, finalizados: 0 };
      cur.finalizados += 1;
      map.set(m.origem, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.finalizados - a.finalizados);
  }, [perLead]);

  return (
    <div className="space-y-6">
      {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard de Formulário</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Métricas agregadas recebidas de fontes externas (formulários, captação, etc.)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const yesterday = subDays(today, 1);
              const isSameDay = (a?: Date | null, b?: Date | null) =>
                !!a && !!b && format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");
              const isToday = isSameDay(fromDate, today) && isSameDay(toDate, today);
              const isYesterday = isSameDay(fromDate, yesterday) && isSameDay(toDate, yesterday);
              return (
                <>
                  <Button
                    variant={isToday ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => setDateRange({ from: today, to: today })}
                  >
                    Hoje
                  </Button>
                  <Button
                    variant={isYesterday ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => setDateRange({ from: yesterday, to: yesterday })}
                  >
                    Ontem
                  </Button>
                </>
              );
            })()}
            <FacebookDateRangePicker
              value={{
                from: fromDate ?? today,
                to: toDate ?? today,
              }}
              comparison={comparison}
              onChange={(period, cmp) => {
                setDateRange({ from: period.from, to: period.to });
                setComparison(cmp);
              }}
              align="end"
            />

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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
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
            icon={<Briefcase className="h-4 w-4" />}
            label="Qualificados Faturamento"
            value={totals.qualFat.toLocaleString("pt-BR")}
            tone="primary"
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            label="Qualificados Renda"
            value={totals.qualRenda.toLocaleString("pt-BR")}
            tone="success"
          />
          <KpiCard
            icon={<UserX className="h-4 w-4" />}
            label="Desqualificados"
            value={totals.desq.toLocaleString("pt-BR")}
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
                          {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(m.received_at)).replace(",", "")}
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
