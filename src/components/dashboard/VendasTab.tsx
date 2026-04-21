import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, isAfter, isBefore, parseISO, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, DollarSign, Target, CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VendaRow {
  id: string;
  agendamento_id: string;
  vendeu: boolean;
  valor: number | null;
  follow_up: boolean;
  follow_up_date: string | null;
  motivo_nao_fechamento: string | null;
  created_at: string;
}

interface AgendamentoRow {
  id: string;
  closer_id: string | null;
  scheduled_date: string;
  lead_name: string;
}

interface CloserRow {
  id: string;
  name: string;
}

interface VendasTabProps {
  currentDate: Date;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(217 91% 60%)",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 72% 51%)",
  "hsl(280 65% 60%)",
];

export default function VendasTab({ currentDate }: VendasTabProps) {
  const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd");

  // Fetch all vendas (with their agendamentos via join é simples: 2 queries)
  const { data: vendas = [] } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab", monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("id, agendamento_id, vendeu, valor, follow_up, follow_up_date, motivo_nao_fechamento, created_at");
      return (data ?? []) as VendaRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: agendamentos = [] } = useQuery<AgendamentoRow[]>({
    queryKey: ["vendas-tab-agendamentos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, closer_id, scheduled_date, lead_name")
        .is("deleted_at", null);
      return (data ?? []) as AgendamentoRow[];
    },
    staleTime: 30_000,
  });

  const { data: closers = [] } = useQuery<CloserRow[]>({
    queryKey: ["vendas-tab-closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return (data ?? []) as CloserRow[];
    },
  });

  // Indexa agendamentos
  const agMap = useMemo(() => {
    const m = new Map<string, AgendamentoRow>();
    agendamentos.forEach((a) => m.set(a.id, a));
    return m;
  }, [agendamentos]);

  const closerMap = useMemo(() => {
    const m = new Map<string, string>();
    closers.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [closers]);

  // Vendas do mês
  const vendasMes = useMemo(() => {
    return vendas.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (!ag) return false;
      return ag.scheduled_date >= monthStart && ag.scheduled_date <= monthEnd;
    });
  }, [vendas, agMap, monthStart, monthEnd]);

  // KPIs
  const totalReunioesComResultado = vendasMes.length;
  const totalVendas = vendasMes.filter((v) => v.vendeu).length;
  const totalNaoFechou = vendasMes.filter((v) => !v.vendeu).length;
  const taxaConversao = totalReunioesComResultado > 0 ? (totalVendas / totalReunioesComResultado) * 100 : 0;
  const receitaTotal = vendasMes.filter((v) => v.vendeu && v.valor).reduce((acc, v) => acc + (v.valor || 0), 0);
  const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;
  const followUpsAgendados = vendasMes.filter((v) => v.follow_up && v.follow_up_date).length;
  const followUpsHoje = vendasMes.filter(
    (v) => v.follow_up && v.follow_up_date && isSameDay(parseISO(v.follow_up_date), new Date()),
  ).length;
  const followUpsAtrasados = vendasMes.filter(
    (v) =>
      v.follow_up &&
      v.follow_up_date &&
      isBefore(parseISO(v.follow_up_date), new Date()) &&
      !isSameDay(parseISO(v.follow_up_date), new Date()),
  ).length;

  // Motivos de não fechamento
  const motivosCount = useMemo(() => {
    const map = new Map<string, number>();
    vendasMes.forEach((v) => {
      if (!v.vendeu && v.motivo_nao_fechamento) {
        map.set(v.motivo_nao_fechamento, (map.get(v.motivo_nao_fechamento) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count);
  }, [vendasMes]);

  // Performance por Closer
  const closerPerf = useMemo(() => {
    const map = new Map<string, { vendas: number; naoFechou: number; receita: number }>();
    vendasMes.forEach((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (!ag?.closer_id) return;
      const cur = map.get(ag.closer_id) || { vendas: 0, naoFechou: 0, receita: 0 };
      if (v.vendeu) {
        cur.vendas += 1;
        cur.receita += v.valor || 0;
      } else {
        cur.naoFechou += 1;
      }
      map.set(ag.closer_id, cur);
    });
    return Array.from(map.entries())
      .map(([closerId, stats]) => ({
        closerId,
        name: closerMap.get(closerId) || "—",
        ...stats,
        total: stats.vendas + stats.naoFechou,
        conversao: stats.vendas + stats.naoFechou > 0 ? (stats.vendas / (stats.vendas + stats.naoFechou)) * 100 : 0,
      }))
      .sort((a, b) => b.vendas - a.vendas);
  }, [vendasMes, agMap, closerMap]);

  // Próximos follow-ups
  const proximosFollowUps = useMemo(() => {
    return vendasMes
      .filter((v) => v.follow_up && v.follow_up_date)
      .map((v) => {
        const ag = agMap.get(v.agendamento_id);
        return {
          id: v.id,
          date: v.follow_up_date!,
          leadName: ag?.lead_name || "—",
          closerName: ag?.closer_id ? closerMap.get(ag.closer_id) || "—" : "—",
          motivo: v.motivo_nao_fechamento || "",
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [vendasMes, agMap, closerMap]);

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Vendas — {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
        <p className="text-xs text-muted-foreground">
          Atualizado em {format(new Date(), "HH:mm")}
        </p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Target}
          label="Taxa de Conversão"
          value={`${taxaConversao.toFixed(1)}%`}
          sub={`${totalVendas} de ${totalReunioesComResultado} reuniões`}
          color="primary"
        />
        <KpiCard
          icon={DollarSign}
          label="Receita Total"
          value={fmtBRL(receitaTotal)}
          sub={`Ticket médio: ${fmtBRL(ticketMedio)}`}
          color="emerald"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Vendas Fechadas"
          value={String(totalVendas)}
          sub={`${totalNaoFechou} não fechou`}
          color="emerald"
        />
        <KpiCard
          icon={CalendarClock}
          label="Follow-ups Ativos"
          value={String(followUpsAgendados)}
          sub={`${followUpsHoje} hoje · ${followUpsAtrasados} atrasados`}
          color={followUpsAtrasados > 0 ? "destructive" : "primary"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Motivos de não fechamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Motivos de Não Fechamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {motivosCount.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Sem dados de não fechamento neste mês.
              </p>
            ) : (
              <div className="space-y-2">
                {motivosCount.map(({ motivo, count }, idx) => {
                  const pct = (count / totalNaoFechou) * 100;
                  return (
                    <div key={motivo} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{motivo}</span>
                        <span className="text-muted-foreground">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance por Closer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Performance por Closer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {closerPerf.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Nenhuma venda registrada neste mês.
              </p>
            ) : (
              <div className="space-y-2">
                {closerPerf.map((c) => (
                  <div key={c.closerId} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.vendas} vendas · {c.total} reuniões · {c.conversao.toFixed(0)}% conv.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-emerald-500">{fmtBRL(c.receita)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximos Follow-ups */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Próximos Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proximosFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              Nenhum follow-up agendado.
            </p>
          ) : (
            <div className="space-y-1.5">
              {proximosFollowUps.map((f) => {
                const date = parseISO(f.date);
                const isLate = isBefore(date, new Date()) && !isSameDay(date, new Date());
                const isToday = isSameDay(date, new Date());
                return (
                  <div
                    key={f.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-md border",
                      isLate && "border-destructive/50 bg-destructive/5",
                      isToday && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <Badge variant={isLate ? "destructive" : isToday ? "default" : "secondary"} className="text-xs">
                      {format(date, "dd/MM")}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.leadName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {f.closerName} · {f.motivo}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  color: "primary" | "emerald" | "destructive";
}) {
  const colorClasses = {
    primary: "text-primary border-primary/30 bg-primary/5",
    emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
    destructive: "text-destructive border-destructive/30 bg-destructive/5",
  };
  return (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-1", colorClasses[color])}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
