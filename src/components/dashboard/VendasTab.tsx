import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isSameDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, DollarSign, Target, CalendarClock, AlertTriangle, CheckCircle2, Receipt,
  Filter, X, CalendarIcon, Pencil, Trash2, Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { brDateOf } from "@/lib/timezone";
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
  follow_up_time: string | null;
  segunda_reuniao: boolean;
  motivo_nao_fechamento: string | null;
  observacoes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  agendamentos: AgendamentoRow | null;
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
  dateRange?: DateRange;
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

export default function VendasTab({ currentDate, dateRange }: VendasTabProps) {
  // Quando há intervalo válido com from!=to, usamos modo intervalo;
  // caso contrário, mantemos o comportamento por dia único (currentDate).
  const isRange = !!(dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to));
  const rangeFromStr = isRange ? format(dateRange!.from!, "yyyy-MM-dd") : null;
  const rangeToStr = isRange ? format(dateRange!.to!, "yyyy-MM-dd") : null;
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Rótulo amigável (Hoje / Ontem / Amanhã / data / intervalo)
  const dayLabel = useMemo(() => {
    if (isRange) {
      return `${format(dateRange!.from!, "dd/MM")} – ${format(dateRange!.to!, "dd/MM")}`;
    }
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    if (isSameDay(currentDate, today)) return "Hoje";
    if (isSameDay(currentDate, yesterday)) return "Ontem";
    if (isSameDay(currentDate, tomorrow)) return "Amanhã";
    return format(currentDate, "dd 'de' MMMM", { locale: ptBR });
  }, [currentDate, isRange, dateRange]);

  // Vendas: buscamos todas (volume baixo); filtramos por data via agendamentos.
  const { data: vendas = [] } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab"],
    queryFn: async () => {
      // Pagina manualmente para contornar o limite default de 1000 linhas do PostgREST.
      const PAGE = 1000;
      const all: VendaRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("vendas")
          .select(`
            id, agendamento_id, vendeu, valor, follow_up, follow_up_date, follow_up_time, segunda_reuniao,
            motivo_nao_fechamento, observacoes, closed_at, created_at, updated_at,
            agendamentos!inner(id, closer_id, scheduled_date, lead_name)
          `)
          .is("agendamentos.deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as VendaRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: 60_000,
  });

  // Mapa agendamento_id -> data (BRT yyyy-MM-dd) em que a venda foi marcada
  // como fechada via follow-up. Usa o audit log com outcome='fechou'.
  const { data: followUpCloseDateMap = new Map<string, string>() } = useQuery<Map<string, string>>({
    queryKey: ["vendas-tab-followup-closes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("entity_id, details, created_at")
        .eq("entity_type", "venda")
        .eq("action", "follow_up_atualizado")
        .range(0, 9999);
      const m = new Map<string, string>();
      ((data ?? []) as { entity_id: string | null; details: any; created_at: string }[])
        .forEach((r) => {
          if (!r.entity_id) return;
          if ((r.details?.outcome ?? "") !== "fechou") return;
          // Mantém o mais recente, caso haja múltiplos
          const cur = m.get(r.entity_id);
          if (!cur || cur < r.created_at) m.set(r.entity_id, brDateOf(r.created_at));
        });
      return m;
    },
    refetchInterval: 60_000,
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
    vendas.forEach((v) => {
      if (v.agendamentos) m.set(v.agendamentos.id, v.agendamentos);
    });
    return m;
  }, [vendas]);

  const closerMap = useMemo(() => {
    const m = new Map<string, string>();
    closers.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [closers]);

  // Data efetiva de "fechamento" da venda (BRT, yyyy-MM-dd):
  // - Se houver override manual (vendas.closed_at), usa esse.
  // - Se houver audit log de follow-up com outcome='fechou' para esse
  //   agendamento, usa essa data (data real do fechamento via follow-up).
  // - Caso contrário, usa scheduled_date da reunião.
  const closingDateOf = (v: VendaRow): string | null => {
    if (v.closed_at) return v.closed_at;
    const ag = agMap.get(v.agendamento_id);
    if (!ag) return null;
    if (v.vendeu) {
      const fuClose = followUpCloseDateMap.get(v.agendamento_id);
      if (fuClose) return fuClose;
    }
    return ag.scheduled_date;
  };

  // Vendas do período selecionado (dia único OU intervalo)
  const vendasDia = useMemo(() => {
    return vendas.filter((v) => {
      const cd = closingDateOf(v);
      if (!cd) return false;
      if (isRange && rangeFromStr && rangeToStr) {
        return cd >= rangeFromStr && cd <= rangeToStr;
      }
      return cd === dateStr;
    });
  }, [vendas, agMap, followUpCloseDateMap, dateStr, isRange, rangeFromStr, rangeToStr]);


  // KPIs
  const totalReunioesComResultado = vendasDia.length;
  const totalVendas = vendasDia.filter((v) => v.vendeu).length;
  const totalNaoFechou = vendasDia.filter((v) => !v.vendeu).length;
  const taxaConversao = totalReunioesComResultado > 0 ? (totalVendas / totalReunioesComResultado) * 100 : 0;
  // Coletado Total = soma de todos os valores efetivamente fechados no dia.
  const coletadoTotal = vendasDia.filter((v) => v.vendeu && v.valor).reduce((acc, v) => acc + (v.valor || 0), 0);
  // Coletado Médio = Coletado Total / Total de Vendas fechadas.
  const coletadoMedio = totalVendas > 0 ? coletadoTotal / totalVendas : 0;

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

  // Filtro por closer no card "Motivos de Não Fechamento"
  const [motivosCloserFilter, setMotivosCloserFilter] = useState<string>("all");

  // Vendas que entram no card de motivos (filtradas opcionalmente por closer)
  const vendasDiaParaMotivos = useMemo(() => {
    if (motivosCloserFilter === "all") return vendasDia;
    return vendasDia.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      return ag?.closer_id === motivosCloserFilter;
    });
  }, [vendasDia, agMap, motivosCloserFilter]);

  const totalNaoFechouMotivos = vendasDiaParaMotivos.filter((v) => !v.vendeu).length;

  // Motivos de não fechamento
  const motivosCount = useMemo(() => {
    const map = new Map<string, number>();
    vendasDiaParaMotivos.forEach((v) => {
      if (!v.vendeu && v.motivo_nao_fechamento) {
        map.set(v.motivo_nao_fechamento, (map.get(v.motivo_nao_fechamento) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count);
  }, [vendasDiaParaMotivos]);

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

  // Filtros para "Próximos Follow-ups"
  const { items: motivosList } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );
  const { role } = useAuth();
  const isManager = role === "gestor" || role === "moderador";
  const queryClient = useQueryClient();

  const [fuFilterCloser, setFuFilterCloser] = useState<string>("all");
  const [fuFilterMotivo, setFuFilterMotivo] = useState<string>("all");
  const [fuFilterDate, setFuFilterDate] = useState<Date | undefined>(undefined);
  const [fuFilterStatus, setFuFilterStatus] = useState<"all" | "overdue" | "today" | "upcoming">("all");
  const [fuSort, setFuSort] = useState<"date_asc" | "overdue_first" | "date_desc">("overdue_first");

  const fuHasFilters =
    fuFilterCloser !== "all" || fuFilterMotivo !== "all" || !!fuFilterDate || fuFilterStatus !== "all";
  const clearFuFilters = () => {
    setFuFilterCloser("all");
    setFuFilterMotivo("all");
    setFuFilterDate(undefined);
    setFuFilterStatus("all");
  };

  // Próximos follow-ups (todos) — com filtros + ordenação
  const proximosFollowUps = useMemo(() => {
    const dateFilterStr = fuFilterDate ? format(fuFilterDate, "yyyy-MM-dd") : null;
    const todayDate = new Date();
    const todayDateStr = format(todayDate, "yyyy-MM-dd");

    return vendas
      .filter((v) => v.follow_up && v.follow_up_date)
      .map((v) => {
        const ag = agMap.get(v.agendamento_id);
        const dateObj = parseISO(v.follow_up_date!);
        const isLate = isBefore(dateObj, todayDate) && !isSameDay(dateObj, todayDate);
        const isToday = isSameDay(dateObj, todayDate);
        const status: "overdue" | "today" | "upcoming" = isLate ? "overdue" : isToday ? "today" : "upcoming";
        return {
          id: v.id,
          agendamentoId: v.agendamento_id,
          date: v.follow_up_date!,
          time: v.follow_up_time,
          leadName: ag?.lead_name || "—",
          closerId: ag?.closer_id || null,
          closerName: ag?.closer_id ? closerMap.get(ag.closer_id) || "—" : "—",
          motivo: v.motivo_nao_fechamento || "",
          observacoes: v.observacoes,
          status,
        };
      })
      .filter((f) => {
        if (fuFilterCloser !== "all" && f.closerId !== fuFilterCloser) return false;
        if (fuFilterMotivo !== "all" && f.motivo !== fuFilterMotivo) return false;
        if (dateFilterStr && f.date !== dateFilterStr) return false;
        if (fuFilterStatus !== "all" && f.status !== fuFilterStatus) return false;
        return true;
      })
      .sort((a, b) => {
        if (fuSort === "overdue_first") {
          // Vencidos primeiro, depois hoje, depois próximos — dentro de cada grupo: data/hora asc
          const rank = { overdue: 0, today: 1, upcoming: 2 };
          if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        }
        const cmp = fuSort === "date_desc"
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp;
        return fuSort === "date_desc"
          ? (b.time || "").localeCompare(a.time || "")
          : (a.time || "").localeCompare(b.time || "");
      })
      .slice(0, 20);
  }, [vendas, agMap, closerMap, fuFilterCloser, fuFilterMotivo, fuFilterDate, fuFilterStatus, fuSort]);

  // Estado para edição/remoção (apenas managers)
  const [editTarget, setEditTarget] = useState<FollowUpEditTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; agendamentoId: string; leadName: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const ok = await removeFollowUp(removeTarget.id, removeTarget.agendamentoId, removeTarget.leadName);
    setRemoving(false);
    if (ok) {
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    }
  };

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
            ({isRange ? `${format(dateRange!.from!, "dd/MM/yyyy")} a ${format(dateRange!.to!, "dd/MM/yyyy")}` : format(currentDate, "dd/MM/yyyy")})
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
          label="Coletado Total"
          value={fmtBRL(coletadoTotal)}
          sub={`${totalVendas} venda${totalVendas !== 1 ? "s" : ""} fechada${totalVendas !== 1 ? "s" : ""}`}
          color="emerald"
          onClick={() =>
            openDrill(`Vendas fechadas — ${dayLabel}`, fechadasIds, fmtBRL(coletadoTotal))
          }
        />
        <KpiCard
          icon={Receipt}
          label="Coletado Médio"
          value={fmtBRL(coletadoMedio)}
          sub={
            totalVendas > 0
              ? `Coletado Total ÷ ${totalVendas} venda${totalVendas !== 1 ? "s" : ""}`
              : "Sem vendas no período"
          }
          color="emerald"
          onClick={() =>
            openDrill(`Coletado médio — ${dayLabel}`, fechadasIds, fmtBRL(coletadoMedio))
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Motivos de Não Fechamento
              </CardTitle>
              <Select value={motivosCloserFilter} onValueChange={setMotivosCloserFilter}>
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue placeholder="Closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os closers</SelectItem>
                  {closers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {motivosCount.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Sem dados de não fechamento neste dia
                {motivosCloserFilter !== "all" ? " para o closer selecionado" : ""}.
              </p>
            ) : (
              <div className="space-y-2">
                {motivosCount.map(({ motivo, count }, idx) => {
                  const pct = totalNaoFechouMotivos > 0 ? (count / totalNaoFechouMotivos) * 100 : 0;
                  const motivoIds = vendasDiaParaMotivos
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
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Próximos Follow-ups
            </CardTitle>
            {fuHasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFuFilters} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Limpar filtros
              </Button>
            )}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <Filter className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-[130px]">
              <Label className="text-[10px] uppercase tracking-wide">Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-8 w-full justify-start text-left font-normal text-xs",
                      !fuFilterDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {fuFilterDate ? format(fuFilterDate, "dd/MM/yyyy") : "Qualquer"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fuFilterDate} onSelect={setFuFilterDate} locale={ptBR} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="min-w-[150px]">
              <Label className="text-[10px] uppercase tracking-wide">Closer</Label>
              <Select value={fuFilterCloser} onValueChange={setFuFilterCloser}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {closers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label className="text-[10px] uppercase tracking-wide">Motivo</Label>
              <Select value={fuFilterMotivo} onValueChange={setFuFilterMotivo}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {motivosList.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-[10px] uppercase tracking-wide">Status</Label>
              <Select value={fuFilterStatus} onValueChange={(v) => setFuFilterStatus(v as typeof fuFilterStatus)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="upcoming">Próximos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Label className="text-[10px] uppercase tracking-wide">Ordenar por</Label>
              <Select value={fuSort} onValueChange={(v) => setFuSort(v as typeof fuSort)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="overdue_first">Vencidos primeiro</SelectItem>
                  <SelectItem value="date_asc">Mais próximos primeiro</SelectItem>
                  <SelectItem value="date_desc">Mais distantes primeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {proximosFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              {fuHasFilters ? "Nenhum follow-up corresponde aos filtros." : "Nenhum follow-up agendado."}
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
                      "w-full flex items-center gap-3 p-2 rounded-md border",
                      isLate && "border-destructive/50 bg-destructive/5",
                      isToday && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        openDrill(
                          `Follow-up: ${f.leadName}`,
                          [f.agendamentoId],
                          `${format(date, "dd/MM/yyyy")}${f.time ? ` · ${f.time}` : ""} · ${f.motivo || "Sem motivo"}`,
                        )
                      }
                      className="flex flex-1 items-center gap-3 text-left min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <Badge variant={isLate ? "destructive" : isToday ? "default" : "secondary"} className="text-xs shrink-0">
                        {format(date, "dd/MM")}
                        {f.time && ` ${f.time}`}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.leadName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {f.closerName}{f.motivo && ` · ${f.motivo}`}
                        </p>
                      </div>
                    </button>
                    {isManager && (
                      <div className="flex gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Editar"
                          onClick={() =>
                            setEditTarget({
                              id: f.id,
                              agendamento_id: f.agendamentoId,
                              follow_up_date: f.date,
                              follow_up_time: f.time,
                              motivo_nao_fechamento: f.motivo || null,
                              observacoes: f.observacoes,
                              lead_name: f.leadName,
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Remover"
                          onClick={() =>
                            setRemoveTarget({
                              id: f.id,
                              agendamentoId: f.agendamentoId,
                              leadName: f.leadName,
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
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

      <FollowUpEditDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
          queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
        }}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && !removing && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              O follow-up de <strong>{removeTarget?.leadName}</strong> será removido da lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmRemove(); }}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
