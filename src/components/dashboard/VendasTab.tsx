import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, DollarSign, Target, CalendarClock, AlertTriangle, CheckCircle2, Receipt,
  Filter, X, CalendarIcon, Pencil, Trash2, Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MetricDrilldownDialog from "@/components/dashboard/MetricDrilldownDialog";
import FollowUpEditDialog, { removeFollowUp, type FollowUpEditTarget } from "@/components/FollowUpEditDialog";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS } from "@/lib/vendaConstants";

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

type DrilldownState = {
  open: boolean;
  title: string;
  subtitle?: string;
  ids: string[];
};

export default function VendasTab({ currentDate }: VendasTabProps) {
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Rótulo amigável do dia (Hoje / Ontem / Amanhã / data)
  const dayLabel = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    if (isSameDay(currentDate, today)) return "Hoje";
    if (isSameDay(currentDate, yesterday)) return "Ontem";
    if (isSameDay(currentDate, tomorrow)) return "Amanhã";
    return format(currentDate, "dd 'de' MMMM", { locale: ptBR });
  }, [currentDate]);

  // Vendas: buscamos todas (volume baixo); filtramos por data via agendamentos.
  const { data: vendas = [] } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab"],
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

  // Vendas do DIA selecionado (mesma janela de Métricas SDRs)
  const vendasDia = useMemo(() => {
    return vendas.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (!ag) return false;
      return ag.scheduled_date === dateStr;
    });
  }, [vendas, agMap, dateStr]);

  // KPIs
  const totalReunioesComResultado = vendasDia.length;
  const totalVendas = vendasDia.filter((v) => v.vendeu).length;
  const totalNaoFechou = vendasDia.filter((v) => !v.vendeu).length;
  const taxaConversao = totalReunioesComResultado > 0 ? (totalVendas / totalReunioesComResultado) * 100 : 0;
  const receitaTotal = vendasDia.filter((v) => v.vendeu && v.valor).reduce((acc, v) => acc + (v.valor || 0), 0);
  const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;

  // Follow-ups (escopo geral — não dependem do dia selecionado)
  const followUpsAgendados = vendas.filter((v) => v.follow_up && v.follow_up_date).length;
  const followUpsHoje = vendas.filter(
    (v) => v.follow_up && v.follow_up_date && v.follow_up_date === todayStr,
  ).length;
  const followUpsAtrasados = vendas.filter(
    (v) => v.follow_up && v.follow_up_date && v.follow_up_date < todayStr,
  ).length;

  // IDs para drill-down
  const vendasDiaIds = vendasDia.map((v) => v.agendamento_id);
  const fechadasIds = vendasDia.filter((v) => v.vendeu).map((v) => v.agendamento_id);
  const naoFechouIds = vendasDia.filter((v) => !v.vendeu).map((v) => v.agendamento_id);
  const followUpsAtivosIds = vendas
    .filter((v) => v.follow_up && v.follow_up_date)
    .map((v) => v.agendamento_id);

  // Motivos de não fechamento
  const motivosCount = useMemo(() => {
    const map = new Map<string, number>();
    vendasDia.forEach((v) => {
      if (!v.vendeu && v.motivo_nao_fechamento) {
        map.set(v.motivo_nao_fechamento, (map.get(v.motivo_nao_fechamento) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count);
  }, [vendasDia]);

  // Performance por Closer
  const closerPerf = useMemo(() => {
    const map = new Map<string, { vendas: number; naoFechou: number; receita: number }>();
    vendasDia.forEach((v) => {
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
  }, [vendasDia, agMap, closerMap]);

  // Próximos follow-ups (todos)
  const proximosFollowUps = useMemo(() => {
    return vendas
      .filter((v) => v.follow_up && v.follow_up_date)
      .map((v) => {
        const ag = agMap.get(v.agendamento_id);
        return {
          id: v.id,
          agendamentoId: v.agendamento_id,
          date: v.follow_up_date!,
          leadName: ag?.lead_name || "—",
          closerName: ag?.closer_id ? closerMap.get(ag.closer_id) || "—" : "—",
          motivo: v.motivo_nao_fechamento || "",
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [vendas, agMap, closerMap]);

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  // Drill-down state
  const [drill, setDrill] = useState<DrilldownState>({ open: false, title: "", ids: [] });
  const openDrill = (title: string, ids: string[], subtitle?: string) =>
    setDrill({ open: true, title, ids, subtitle });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">
          Vendas — {dayLabel}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({format(currentDate, "dd/MM/yyyy")})
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Atualizado em {format(new Date(), "HH:mm")}
        </p>
      </div>

      {/* KPIs principais (5 cards, todos clicáveis) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          icon={Target}
          label="Taxa de Conversão"
          value={`${taxaConversao.toFixed(1)}%`}
          sub={`${totalVendas} de ${totalReunioesComResultado} reuniões`}
          color="primary"
          onClick={() =>
            openDrill(
              `Reuniões com resultado — ${dayLabel}`,
              vendasDiaIds,
              `Taxa de conversão: ${taxaConversao.toFixed(1)}%`,
            )
          }
        />
        <KpiCard
          icon={DollarSign}
          label="Receita Total"
          value={fmtBRL(receitaTotal)}
          sub={`${totalVendas} venda${totalVendas !== 1 ? "s" : ""} fechada${totalVendas !== 1 ? "s" : ""}`}
          color="emerald"
          onClick={() =>
            openDrill(`Vendas fechadas — ${dayLabel}`, fechadasIds, fmtBRL(receitaTotal))
          }
        />
        <KpiCard
          icon={Receipt}
          label="Ticket Médio"
          value={fmtBRL(ticketMedio)}
          sub={
            totalVendas > 0
              ? `Base: ${totalVendas} venda${totalVendas !== 1 ? "s" : ""}`
              : "Sem vendas no período"
          }
          color="emerald"
          onClick={() =>
            openDrill(`Ticket médio — ${dayLabel}`, fechadasIds, fmtBRL(ticketMedio))
          }
        />
        <KpiCard
          icon={CheckCircle2}
          label="Vendas Fechadas"
          value={String(totalVendas)}
          sub={`${totalNaoFechou} não fechou`}
          color="emerald"
          onClick={() =>
            openDrill(`Vendas fechadas — ${dayLabel}`, fechadasIds)
          }
        />
        <KpiCard
          icon={CalendarClock}
          label="Follow-ups Ativos"
          value={String(followUpsAgendados)}
          sub={`${followUpsHoje} hoje · ${followUpsAtrasados} atrasados`}
          color={followUpsAtrasados > 0 ? "destructive" : "primary"}
          onClick={() =>
            openDrill(
              "Follow-ups ativos",
              followUpsAtivosIds,
              `${followUpsHoje} hoje · ${followUpsAtrasados} atrasados`,
            )
          }
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
                Sem dados de não fechamento neste dia.
              </p>
            ) : (
              <div className="space-y-2">
                {motivosCount.map(({ motivo, count }, idx) => {
                  const pct = totalNaoFechou > 0 ? (count / totalNaoFechou) * 100 : 0;
                  const motivoIds = vendasDia
                    .filter((v) => !v.vendeu && v.motivo_nao_fechamento === motivo)
                    .map((v) => v.agendamento_id);
                  return (
                    <button
                      key={motivo}
                      type="button"
                      onClick={() => openDrill(`Motivo: ${motivo} — ${dayLabel}`, motivoIds)}
                      className="w-full text-left space-y-1 hover:opacity-80 transition-opacity"
                    >
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
                    </button>
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
                Nenhuma venda registrada neste dia.
              </p>
            ) : (
              <div className="space-y-2">
                {closerPerf.map((c) => {
                  const closerIds = vendasDia
                    .filter((v) => agMap.get(v.agendamento_id)?.closer_id === c.closerId)
                    .map((v) => v.agendamento_id);
                  return (
                    <button
                      key={c.closerId}
                      type="button"
                      onClick={() => openDrill(`${c.name} — ${dayLabel}`, closerIds, fmtBRL(c.receita))}
                      className="w-full flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.vendas} vendas · {c.total} reuniões · {c.conversao.toFixed(0)}% conv.
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-emerald-500">{fmtBRL(c.receita)}</p>
                      </div>
                    </button>
                  );
                })}
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
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      openDrill(
                        `Follow-up: ${f.leadName}`,
                        [f.agendamentoId],
                        `${format(date, "dd/MM/yyyy")} · ${f.motivo || "Sem motivo"}`,
                      )
                    }
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-md border text-left hover:bg-muted/40 transition-colors",
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
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <MetricDrilldownDialog
        open={drill.open}
        onOpenChange={(o) => setDrill((d) => ({ ...d, open: o }))}
        title={drill.title}
        subtitle={drill.subtitle}
        agendamentoIds={drill.ids}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  onClick,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  color: "primary" | "emerald" | "destructive";
  onClick?: () => void;
}) {
  const colorClasses = {
    primary: "text-primary border-primary/30 bg-primary/5",
    emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
    destructive: "text-destructive border-destructive/30 bg-destructive/5",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 flex flex-col gap-1 text-left transition-all",
        "hover:scale-[1.02] hover:shadow-md cursor-pointer",
        colorClasses[color],
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
}
