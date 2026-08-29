import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isSameDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, DollarSign, Target, CalendarClock, AlertTriangle, CheckCircle2, Receipt,
  Filter, X, CalendarIcon, Pencil, Trash2, Loader2, Download, Phone, PlusCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { brDateOf, brTodayYMD, formatBRDateTime } from "@/lib/timezone";
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
import TrendCardVendas from "@/components/dashboard/TrendCardVendas";
import ConversaoPorHoraCard from "@/components/dashboard/ConversaoPorHoraCard";

import AgendasPorCanalPanel from "@/components/dashboard/AgendasPorCanalPanel";
import AvulsaSaleDialog from "@/components/dashboard/AvulsaSaleDialog";
import FollowUpEditDialog, { removeFollowUp, type FollowUpEditTarget } from "@/components/FollowUpEditDialog";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS } from "@/lib/vendaConstants";

interface VendaRow {
  id: string;
  agendamento_id: string;
  vendeu: boolean;
  valor: number | null;
  valor_total_projeto: number | null;
  produto: string | null;
  order_bumps?: unknown;
  follow_up: boolean;
  follow_up_date: string | null;
  follow_up_time: string | null;
  segunda_reuniao: boolean;
  motivo_nao_fechamento: string | null;
  explicacao_nao_fechamento?: string | null;
  resumo_venda?: string | null;
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
  scheduled_time: string;
  lead_name: string;
  lead_phone: string | null;
  channel_type: string | null;
  briefing?: string | null;
  created_at: string;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  status: string;
  meeting_reason: string | null;
  is_venda_avulsa: boolean | null;
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
  // Período selecionado. Aceita intervalo completo OU apenas a data inicial
  // (nesse caso from = to, igual ao comportamento das outras abas do dashboard).
  const pickedFrom = dateRange?.from ?? null;
  const pickedTo = dateRange?.to ?? dateRange?.from ?? null;
  const hasPicked = !!(pickedFrom && pickedTo);
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const periodFrom = hasPicked ? format(pickedFrom!, "yyyy-MM-dd") : dateStr;
  const periodTo = hasPicked ? format(pickedTo!, "yyyy-MM-dd") : dateStr;
  const isRange = periodFrom !== periodTo;
  const rangeFromStr = isRange ? periodFrom : null;
  const rangeToStr = isRange ? periodTo : null;
  const todayStr = brTodayYMD();

  // Rótulo amigável (Hoje / Ontem / Amanhã / data / intervalo)
  const dayLabel = useMemo(() => {
    if (isRange) {
      return `${format(parseISO(periodFrom), "dd/MM")} – ${format(parseISO(periodTo), "dd/MM")}`;
    }
    const single = parseISO(periodFrom);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    if (isSameDay(single, today)) return "Hoje";
    if (isSameDay(single, yesterday)) return "Ontem";
    if (isSameDay(single, tomorrow)) return "Amanhã";
    return format(single, "dd 'de' MMMM", { locale: ptBR });
  }, [isRange, periodFrom, periodTo]);

  // Janela em UTC correspondente ao período em BRT (UTC-3), usada para
  // filtrar `updated_at` (momento em que a venda foi registrada).
  const periodUtc = useMemo(() => {
    const nextYmd = (ymd: string) =>
      format(new Date(new Date(ymd + "T12:00:00Z").getTime() + 24 * 3600_000), "yyyy-MM-dd");
    return {
      startUtc: `${periodFrom}T03:00:00.000Z`,
      endUtc: `${nextYmd(periodTo)}T03:00:00.000Z`,
    };
  }, [periodFrom, periodTo]);

  // Evita que o parser de tipos do supabase-js processe strings de select
  // gigantes (custo alto de typecheck).
  const sel = (s: string): string => s;
  // Select enxuto: só os campos usados pelos quadros/drilldowns. Textos longos
  // (briefing, resumo, observações) são buscados apenas no download do CSV.
  const VENDA_SELECT = `
    id, agendamento_id, vendeu, valor, valor_total_projeto, produto, order_bumps, follow_up, follow_up_date, follow_up_time, segunda_reuniao,
    motivo_nao_fechamento, observacoes, closed_at, created_at, updated_at,
    agendamentos!inner(id, closer_id, scheduled_date, scheduled_time, lead_name, lead_phone, channel_type, created_at, created_by, sdr_responsavel_id, status, meeting_reason, is_venda_avulsa)
  `;


  // O backend devolve no máximo 1.000 linhas por requisição. Sem paginação os
  // quadros ficavam truncados (e com números aleatórios) em períodos longos.
  const PAGE_SIZE = 1000;
  async function fetchAllPages<T>(
    build: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < 60; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await build(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    return out;
  }

  const closedAtOrFilter =
    `and(closed_at.gte.${periodFrom},closed_at.lte.${periodTo}),` +
    `and(closed_at.is.null,updated_at.gte.${periodUtc.startUtc},updated_at.lt.${periodUtc.endUtc})`;

  // 1) VENDAS FECHADAS do período — atribuídas pela data de fechamento
  //    (closed_at quando existir; senão a data em que foram registradas).
  //    Não depende da data da reunião: follow-ups antigos entram igual.
  const { data: vendasFechadas = [] } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab-fechadas", periodFrom, periodTo],
    queryFn: () =>
      fetchAllPages<VendaRow>((from, to) =>
        supabase
          .from("vendas")
          .select(sel(VENDA_SELECT))
          .eq("vendeu", true)
          .is("agendamentos.deleted_at", null)
          .or(closedAtOrFilter)
          .order("id", { ascending: true })
          .range(from, to)
          .returns<VendaRow[]>(),
      ),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // 2) NÃO FECHOU no período — atribuídas pela data da reunião (visão
  //    operacional da call, base dos Motivos de Não Fechamento).
  const { data: vendasNaoFechou = [] } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab-nao-fechou", periodFrom, periodTo],
    queryFn: () =>
      fetchAllPages<VendaRow>((from, to) =>
        supabase
          .from("vendas")
          .select(sel(VENDA_SELECT))
          .eq("vendeu", false)
          .is("agendamentos.deleted_at", null)
          .gte("agendamentos.scheduled_date", periodFrom)
          .lte("agendamentos.scheduled_date", periodTo)
          .order("id", { ascending: true })
          .range(from, to)
          .returns<VendaRow[]>(),
      ),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // 3) FOLLOW-UPS ATIVOS — métrica global, independe do período selecionado.
  const { data: followUpsAtivosRows = [], isLoading: loadingFollowUps } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab-follow-ups"],
    queryFn: () =>
      fetchAllPages<VendaRow>((from, to) =>
        supabase
          .from("vendas")
          .select(sel(VENDA_SELECT))
          .eq("follow_up", true)
          .not("follow_up_date", "is", null)
          .is("agendamentos.deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to)
          .returns<VendaRow[]>(),
      ),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // Base combinada (deduplicada) usada pelos quadros que precisam das três listas.
  const vendas = useMemo<VendaRow[]>(() => {
    const m = new Map<string, VendaRow>();
    [...vendasFechadas, ...vendasNaoFechou, ...followUpsAtivosRows].forEach((v) => m.set(v.id, v));
    return Array.from(m.values());
  }, [vendasFechadas, vendasNaoFechou, followUpsAtivosRows]);

  // Todos os closers (inclusive inativos) para resolver nomes no histórico.
  const { data: closers = [] } = useQuery<(CloserRow & { email: string | null; active: boolean })[]>({
    queryKey: ["vendas-tab-closers-all"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name, email, active").order("name");
      return (data ?? []) as (CloserRow & { email: string | null; active: boolean })[];
    },
  });

  // Apenas ativos nos seletores de filtro.
  const activeClosers = useMemo(() => closers.filter((c) => c.active), [closers]);


  // Vendas SUBIDAS no período selecionado (independente da data da reunião) —
  // reflete o momento em que o closer registrou a venda no sistema.
  const uploadPeriod = useMemo(
    () => ({ from: periodFrom, to: periodTo, startUtc: periodUtc.startUtc, endUtc: periodUtc.endUtc }),
    [periodFrom, periodTo, periodUtc],
  );

  const { data: vendasHoje = [] } = useQuery<
    { agendamento_id: string; valor: number | null; follow_up: boolean; segunda_reuniao: boolean; venda_origem: string | null; scheduled_date: string; meeting_reason: string | null; closer_id: string | null; closed_at: string | null; updated_at: string }[]
  >({
    queryKey: ["vendas-uploaded-period", uploadPeriod.from, uploadPeriod.to, uploadPeriod.startUtc, uploadPeriod.endUtc],
    queryFn: async () => {
      // Aceita a venda se closed_at (override manual da data da venda) OU
      // updated_at (fallback: momento em que a venda foi registrada) cair no período.
      // O filtro final por "data efetiva de subida" acontece client-side em BRT.
      const { data, error } = await supabase
        .from("vendas")
        .select(sel("agendamento_id, valor, follow_up, segunda_reuniao, venda_origem, updated_at, closed_at, agendamentos!inner(scheduled_date, meeting_reason, closer_id, deleted_at)"))
        .eq("vendeu", true)
        .is("agendamentos.deleted_at", null)
        .or(
          `and(closed_at.gte.${uploadPeriod.from},closed_at.lte.${uploadPeriod.to}),` +
          `and(closed_at.is.null,updated_at.gte.${uploadPeriod.startUtc},updated_at.lt.${uploadPeriod.endUtc})`,
        );
      if (error) throw error;
      return ((data ?? []) as any[]).map((v) => ({
        agendamento_id: v.agendamento_id,
        valor: v.valor,
        follow_up: v.follow_up,
        segunda_reuniao: v.segunda_reuniao,
        venda_origem: v.venda_origem ?? null,
        scheduled_date: v.agendamentos?.scheduled_date,
        meeting_reason: v.agendamentos?.meeting_reason ?? null,
        closer_id: v.agendamentos?.closer_id ?? null,
        closed_at: v.closed_at ?? null,
        updated_at: v.updated_at,
      }));
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });



  // Mapa user_id -> full_name (para resolver nome do SDR no CSV)
  const { data: profilesMap = new Map<string, string>() } = useQuery<Map<string, string>>({
    queryKey: ["vendas-tab-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_profiles");
      if (error) throw error;
      const m = new Map<string, string>();
      ((data ?? []) as { user_id: string; full_name: string }[]).forEach((p) => {
        m.set(p.user_id, p.full_name);
      });
      return m;
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

  // Closer logado: trava todos os filtros nos próprios números.
  const { user, role } = useAuth();
  const isCloserView = role === "closer";
  const myCloserId = useMemo(() => {
    if (!isCloserView || !user?.email) return null;
    const me = closers.find((c) => (c as any).email?.toLowerCase?.() === user.email!.toLowerCase());
    return me?.id ?? null;
  }, [isCloserView, user?.email, closers]);

  // Data efetiva de "fechamento" da venda (BRT, yyyy-MM-dd) — regra única:
  // - Override manual (vendas.closed_at) tem prioridade.
  // - Venda: data em que foi registrada no sistema (updated_at em BRT).
  // - Não fechou: data da reunião (scheduled_date).
  const closingDateOf = (v: VendaRow): string | null => {
    if (v.closed_at) return v.closed_at;
    if (v.vendeu) return brDateOf(v.updated_at);
    const ag = agMap.get(v.agendamento_id);
    return ag?.scheduled_date ?? null;
  };

  // Vendas do período selecionado (dia único OU intervalo). Para closer logado,
  // aplica filtro adicional para mostrar apenas seus próprios números.
  const inRangeYmd = (ymd: string) => ymd >= periodFrom && ymd <= periodTo;
  const vendasDia = useMemo(() => {
    return vendas.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (!ag) return false;
      if (isCloserView) {
        if (!myCloserId || ag.closer_id !== myCloserId) return false;
      }
      // Venda registrada conta sempre (o status da reunião pode estar atrasado);
      // "não fechou" só entra quando a reunião está marcada como realizada.
      if (!v.vendeu && ag.status !== "realizada") return false;
      const cd = closingDateOf(v);
      if (!cd) return false;
      return inRangeYmd(cd);
    });
  }, [vendas, agMap, periodFrom, periodTo, isCloserView, myCloserId]);


  // Base do card "Taxa de Conversão": busca AGENDAMENTOS realizados no período
  // direto da tabela `agendamentos` (independente da existência de linha em `vendas`).
  // Isso garante que o denominador case com o total operacional do calendário,
  // incluindo reuniões criadas por closer. Exclui apenas Call Interompida/Interrompida.
  const convPeriodFrom = periodFrom;
  const convPeriodTo = periodTo;

  const {
    data: conversaoData,
    isLoading: loadingConversao,
    isError: erroConversao,
  } = useQuery<{ totalReunioes: number; totalVendas: number; ids: string[] }>({
    queryKey: ["vendas-tab-conversao", convPeriodFrom, convPeriodTo, isCloserView, myCloserId],
    queryFn: async () => {
      // Agrega direto no banco via RPC: elimina paginação de milhares de linhas
      // e o pós-processamento client-side (C4 residual). A RPC roda em
      // SECURITY INVOKER, então o RLS do usuário continua sendo aplicado.
      const { data, error } = await supabase.rpc("dashboard_conversao_period", {
        p_from: convPeriodFrom,
        p_to: convPeriodTo,
        p_closer_id: isCloserView && myCloserId ? myCloserId : null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        totalReunioes: row?.total_reunioes ?? 0,
        totalVendas: row?.total_vendas ?? 0,
        ids: (row?.ids ?? []) as string[],
      };
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
  });

  // KPIs agregados NO BANCO — não dependem de baixar linhas, então nunca ficam
  // truncados no limite de 1.000 registros nem demoram em períodos longos.
  const { data: kpiRow, isLoading: loadingKpis } = useQuery({
    queryKey: ["vendas-tab-kpis", periodFrom, periodTo, isCloserView, myCloserId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_vendas_kpis", {
        p_from: periodFrom,
        p_to: periodTo,
        p_closer_id: isCloserView && myCloserId ? myCloserId : null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null;
      return row;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // Reuniões realizadas sem closer atribuído no período (ficam fora da
  // Performance por Closer — sinalizamos para o gestor cobrar a atribuição).
  const { data: realizadasSemCloser = 0 } = useQuery<number>({
    queryKey: ["vendas-tab-sem-closer", periodFrom, periodTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_vendas_realizadas_sem_closer", {
        p_from: periodFrom,
        p_to: periodTo,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const loadingVendas = loadingKpis;
  const vendasSemStatusRealizada = Number(kpiRow?.vendas_sem_status_realizada ?? 0);

  const kpis = useMemo(() => {
    const totalVendasCalls = Number(kpiRow?.vendas_calls ?? 0);
    const totalVendasAvulsas = Number(kpiRow?.vendas_avulsas ?? 0);
    const totalVendas = totalVendasCalls + totalVendasAvulsas;
    const totalNaoFechou = Number(kpiRow?.nao_fechou ?? 0);
    const totalReunioesComResultado = totalVendasCalls + totalNaoFechou;

    const totalReunioesConv = conversaoData?.totalReunioes ?? 0;
    const totalVendasConv = conversaoData?.totalVendas ?? 0;
    const taxaConversao = totalReunioesConv > 0 ? (totalVendasConv / totalReunioesConv) * 100 : 0;

    const coletadoCalls = Number(kpiRow?.coletado_calls ?? 0);
    const coletadoAvulsa = Number(kpiRow?.coletado_avulsa ?? 0);
    const coletadoTotal = coletadoCalls + coletadoAvulsa;
    const coletadoMedio = totalVendas > 0 ? coletadoTotal / totalVendas : 0;

    const faturadoCalls = Number(kpiRow?.faturado_calls ?? 0);
    const faturadoAvulsa = Number(kpiRow?.faturado_avulsa ?? 0);
    const faturadoTotal = faturadoCalls + faturadoAvulsa;

    const vendasPrimeiraCall = Number(kpiRow?.vendas_primeira_call ?? 0);
    const vendasFollowOuSegunda = Number(kpiRow?.vendas_follow ?? 0);
    const pctPrimeiraCall = totalVendasCalls > 0 ? (vendasPrimeiraCall / totalVendasCalls) * 100 : 0;
    const pctFollow = totalVendasCalls > 0 ? (vendasFollowOuSegunda / totalVendasCalls) * 100 : 0;

    const ofertasPrecoCount = Number(kpiRow?.ofertas_preco ?? 0);
    const pctOfertaPreco =
      totalReunioesComResultado > 0 ? (ofertasPrecoCount / totalReunioesComResultado) * 100 : 0;

    return {
      totalReunioesComResultado, totalVendas, totalVendasCalls, totalVendasAvulsas, totalNaoFechou,
      taxaConversao, totalReunioesConv, totalVendasConv, coletadoTotal, coletadoCalls, coletadoAvulsa,
      coletadoMedio, faturadoTotal, faturadoCalls, faturadoAvulsa, pctPrimeiraCall, pctFollow,
      vendasFollowOuSegunda, ofertasPrecoCount, pctOfertaPreco,
    };
  }, [kpiRow, conversaoData]);

  const { totalReunioesComResultado, totalVendas, totalVendasCalls, totalVendasAvulsas, totalNaoFechou, taxaConversao, totalReunioesConv, totalVendasConv, coletadoTotal, coletadoCalls, coletadoAvulsa, coletadoMedio, faturadoTotal, faturadoCalls, faturadoAvulsa, pctPrimeiraCall, pctFollow, vendasFollowOuSegunda, ofertasPrecoCount, pctOfertaPreco } = kpis;

  // IDs para drilldown da métrica de oferta de preço (baseado nas linhas do período).
  const ofertasPrecoIds = useMemo(
    () =>
      vendasDia
        .filter(
          (v) =>
            !agMap.get(v.agendamento_id)?.is_venda_avulsa &&
            (v.vendeu || (typeof v.valor === "number" && (v.valor || 0) > 0)),
        )
        .map((v) => v.agendamento_id),
    [vendasDia, agMap],
  );



  // Follow-ups (escopo geral — não dependem do dia selecionado).
  // Para closer logado, aplica filtro adicional para mostrar apenas seus próprios follow-ups.
  const followUpStats = useMemo(() => {
    const ativos = followUpsAtivosRows.filter((v) => {
      if (!v.follow_up || !v.follow_up_date) return false;
      if (isCloserView) {
        const ag = agMap.get(v.agendamento_id);
        if (!myCloserId || ag?.closer_id !== myCloserId) return false;
      }
      return true;
    });
    return {
      followUpsAgendados: ativos.length,
      followUpsHoje: ativos.filter((v) => v.follow_up_date === todayStr).length,
      followUpsAtrasados: ativos.filter((v) => v.follow_up_date! < todayStr).length,
      followUpsAtivosIds: ativos.map((v) => v.agendamento_id),
    };
  }, [followUpsAtivosRows, todayStr, isCloserView, myCloserId, agMap]);

  const { followUpsAgendados, followUpsHoje, followUpsAtrasados, followUpsAtivosIds } = followUpStats;

  // IDs para drill-down
  const drilldownIds = useMemo(() => {
    const fechadasIds = vendasDia.filter((v) => v.vendeu).map((v) => v.agendamento_id);
    const conversaoIds = Array.from(new Set([...(conversaoData?.ids ?? []), ...fechadasIds]));
    return {
      vendasDiaIds: vendasDia.map((v) => v.agendamento_id),
      fechadasIds,
      fechadasPrimeiraCallIds: vendasDia.filter((v) => v.vendeu && !v.follow_up && !v.segunda_reuniao && agMap.get(v.agendamento_id)?.meeting_reason !== "segunda_reuniao").map((v) => v.agendamento_id),
      fechadasFollowIds: vendasDia.filter((v) => v.vendeu && (v.follow_up || v.segunda_reuniao || agMap.get(v.agendamento_id)?.meeting_reason === "segunda_reuniao")).map((v) => v.agendamento_id),
      naoFechouIds: vendasDia.filter((v) => !v.vendeu).map((v) => v.agendamento_id),
      conversaoIds,
    };
  }, [vendasDia, agMap, conversaoData]);

  const { vendasDiaIds, fechadasIds, fechadasPrimeiraCallIds, fechadasFollowIds, naoFechouIds, conversaoIds } = drilldownIds;

  // Filtros do card "Motivos de Não Fechamento"
  const [motivosCloserFilter, setMotivosCloserFilter] = useState<string>("all");
  const [motivosChannelFilter, setMotivosChannelFilter] = useState<string>("all");
  const [motivosPrecoFilter, setMotivosPrecoFilter] = useState<"all" | "sim" | "nao">("all");

  // Canais disponíveis nas vendas do período (para o filtro)
  const motivosChannels = useMemo(() => {
    const set = new Set<string>();
    vendasDia.forEach((v) => {
      const ch = agMap.get(v.agendamento_id)?.channel_type;
      if (ch) set.add(ch);
    });
    return Array.from(set).sort();
  }, [vendasDia, agMap]);

  // Vendas que entram no card de motivos (filtradas opcionalmente por closer e canal).
  // Aqui RE-INCLUÍMOS "Call Interompida" (que é excluída de vendasDia), pois o
  // card de motivos deve mostrar quantas calls foram interrompidas no período.
  const vendasDiaParaMotivos = useMemo(() => {
    const base = vendas.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (!ag) return false;
      if (isCloserView) {
        if (!myCloserId || ag.closer_id !== myCloserId) return false;
      }
      if (!v.vendeu && ag.status !== "realizada") return false;
      const cd = closingDateOf(v);
      if (!cd) return false;
      return cd >= periodFrom && cd <= periodTo;
    });
    return base.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (motivosCloserFilter !== "all" && ag?.closer_id !== motivosCloserFilter) return false;
      if (motivosChannelFilter !== "all" && ag?.channel_type !== motivosChannelFilter) return false;
      if (motivosPrecoFilter !== "all" && !v.vendeu) {
        const ofertou = typeof v.valor === "number" && (v.valor || 0) > 0;
        if (motivosPrecoFilter === "sim" && !ofertou) return false;
        if (motivosPrecoFilter === "nao" && ofertou) return false;
      }
      return true;
    });
  }, [vendas, agMap, periodFrom, periodTo, isCloserView, myCloserId, motivosCloserFilter, motivosChannelFilter, motivosPrecoFilter]);


  // Download CSV dos leads que estão na seção "Motivos de Não Fechamento".
  // Os textos longos (briefing/resumo/observações) não vêm nas consultas dos
  // quadros — são buscados aqui, só para as linhas exportadas.
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const handleDownloadMotivosCsv = async () => {
    const rows = vendasDiaParaMotivos.filter((v) => !v.vendeu);
    if (rows.length === 0 || downloadingCsv) return;
    setDownloadingCsv(true);
    const extras = new Map<string, { explicacao_nao_fechamento: string | null; resumo_venda: string | null; observacoes: string | null; briefing: string | null }>();
    try {
      const ids = rows.map((v) => v.id);
      for (let i = 0; i < ids.length; i += 300) {
        const chunk = ids.slice(i, i + 300);
        const { data } = await supabase
          .from("vendas")
          .select(sel("id, explicacao_nao_fechamento, resumo_venda, observacoes, agendamentos(briefing)"))
          .in("id", chunk);
        ((data ?? []) as any[]).forEach((r) => {
          extras.set(r.id, {
            explicacao_nao_fechamento: r.explicacao_nao_fechamento ?? null,
            resumo_venda: r.resumo_venda ?? null,
            observacoes: r.observacoes ?? null,
            briefing: r.agendamentos?.briefing ?? null,
          });
        });
      }
    } finally {
      setDownloadingCsv(false);
    }


    const headers = [
      "Lead", "Telefone", "Data agendamento", "Hora", "Closer", "SDR", "Canal",
      "Criado em", "Status reunião", "Motivo do não fechamento",
      "Explicação do porquê não fechou", "Resumo do cliente", "Briefing", "Observações",
    ];

    const escape = (val: unknown) => {
      const s = val == null ? "" : String(val);
      return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    };

    const fmtScheduledDate = (ymd: string) => {
      const [y, m, d] = ymd.split("-");
      return d && m && y ? `${d}/${m}/${y}` : ymd;
    };

    const lines = rows.map((v) => {
      const ag = v.agendamentos;
      const extra = extras.get(v.id);
      const closerName = ag?.closer_id ? closerMap.get(ag.closer_id) || "" : "";
      const sdrId = ag?.sdr_responsavel_id ?? ag?.created_by ?? null;
      const sdrName = sdrId ? profilesMap.get(sdrId) || "" : "";
      return [
        ag?.lead_name ?? "",
        ag?.lead_phone ?? "",
        ag ? fmtScheduledDate(ag.scheduled_date) : "",
        ag?.scheduled_time ?? "",
        closerName,
        sdrName,
        ag?.channel_type ?? "",
        ag?.created_at ? formatBRDateTime(ag.created_at) : "",
        ag?.status ?? "",
        v.motivo_nao_fechamento ?? "",
        extra?.explicacao_nao_fechamento ?? "",
        extra?.resumo_venda ?? "",
        extra?.briefing ?? "",
        extra?.observacoes ?? "",
      ].map(escape).join(";");
    });


    const csv = "\uFEFF" + [headers.map(escape).join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const periodoSlug = isRange && rangeFromStr && rangeToStr
      ? `${rangeFromStr}_a_${rangeToStr}`
      : dateStr;
    const closerSlug = motivosCloserFilter === "all"
      ? "todos-closers"
      : (closerMap.get(motivosCloserFilter) || "closer").toLowerCase().replace(/\s+/g, "-");
    a.href = url;
    a.download = `motivos-nao-fechamento_${periodoSlug}_${closerSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Motivos de não fechamento — agregados no banco (não trunca em 1.000 linhas).
  const { data: motivosData } = useQuery<{ motivos: { motivo: string; count: number }[]; total: number }>({
    queryKey: [
      "vendas-tab-motivos",
      periodFrom,
      periodTo,
      motivosCloserFilter,
      motivosChannelFilter,
      motivosPrecoFilter,
      isCloserView,
      myCloserId,
    ],
    queryFn: async () => {
      const closerParam = isCloserView
        ? myCloserId
        : motivosCloserFilter === "all"
          ? null
          : motivosCloserFilter;
      const { data, error } = await supabase.rpc("dashboard_vendas_motivos", {
        p_from: periodFrom,
        p_to: periodTo,
        p_closer_id: closerParam,
        p_channel: motivosChannelFilter === "all" ? null : motivosChannelFilter,
        p_preco: motivosPrecoFilter === "all" ? null : motivosPrecoFilter,
      });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        motivos: rows.map((r) => ({ motivo: r.motivo as string, count: Number(r.qtd ?? 0) })),
        total: rows.length > 0 ? Number(rows[0].total_nao_fechou ?? 0) : 0,
      };
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const motivosCount = motivosData?.motivos ?? [];
  const totalNaoFechouMotivos = motivosData?.total ?? 0;


  // Filtro de canal aplicado à Performance por Closer
  const [closerChannelFilter, setCloserChannelFilter] = useState<"all" | "Social Selling" | "Tráfego Pago">("all");
  // Ordenação do ranking de closers
  const [closerSortKey, setCloserSortKey] = useState<
    "receita" | "conversao" | "ticket" | "vendas" | "realizadas"
  >("receita");

  // Performance por Closer agregada NO BANCO:
  // Numerador: vendas do closer no período (data de fechamento, inclui follow-up).
  // Denominador: TODAS as reuniões realizadas do closer no período.
  const { data: closerPerfRows = [], isLoading: loadingCloserPerf } = useQuery<
    { closer_id: string; realizadas: number; vendas: number; receita: number }[]
  >({
    queryKey: [
      "vendas-tab-closer-perf",
      periodFrom,
      periodTo,
      closerChannelFilter,
      isCloserView,
      myCloserId,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_vendas_closer_perf", {
        p_from: periodFrom,
        p_to: periodTo,
        p_channel: closerChannelFilter === "all" ? null : closerChannelFilter,
        p_closer_id: isCloserView && myCloserId ? myCloserId : null,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        closer_id: r.closer_id as string,
        realizadas: Number(r.realizadas ?? 0),
        vendas: Number(r.vendas ?? 0),
        receita: Number(r.receita ?? 0),
      }));
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const closerPerf = useMemo(() => {
    const primary = (r: { vendas: number; receita: number; total: number; conversao: number }) => {
      switch (closerSortKey) {
        case "conversao":
          return r.conversao;
        case "ticket":
          return r.vendas > 0 ? r.receita / r.vendas : 0;
        case "vendas":
          return r.vendas;
        case "realizadas":
          return r.total;
        default:
          return r.receita;
      }
    };
    return closerPerfRows
      .map((r) => ({
        closerId: r.closer_id,
        name: closerMap.get(r.closer_id) || "Closer removido",
        vendas: r.vendas,
        receita: r.receita,
        total: r.realizadas,
        conversao: r.realizadas > 0 ? (r.vendas / r.realizadas) * 100 : 0,
      }))
      .sort(
        (a, b) =>
          primary(b) - primary(a) ||
          b.conversao - a.conversao ||
          b.vendas - a.vendas ||
          b.receita - a.receita ||
          b.total - a.total,
      );
  }, [closerPerfRows, closerMap, closerSortKey]);




  // Performance por Produto oferecido
  const produtoPerf = useMemo(() => {
    const map = new Map<string, { ofertas: number; vendas: number; receita: number }>();
    vendasDia.forEach((v) => {
      // Considera "ofertou" quando há produto registrado (Sim/Não vendeu com produto).
      const produtoKey = (v.produto && v.produto.trim()) || "Sem produto";
      const cur = map.get(produtoKey) || { ofertas: 0, vendas: 0, receita: 0 };
      cur.ofertas += 1;
      if (v.vendeu) {
        cur.vendas += 1;
        cur.receita += v.valor || 0;
      }
      map.set(produtoKey, cur);
    });
    return Array.from(map.entries())
      .map(([produto, s]) => ({
        produto,
        ofertas: s.ofertas,
        vendas: s.vendas,
        receita: s.receita,
        conversao: s.ofertas > 0 ? (s.vendas / s.ofertas) * 100 : 0,
        ticketMedio: s.vendas > 0 ? s.receita / s.vendas : 0,
      }))
      .sort((a, b) => b.receita - a.receita || b.ofertas - a.ofertas);
  }, [vendasDia]);


  // Filtros para "Próximos Follow-ups"
  const { items: motivosList } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );
  const isManager = role === "gestor" || (role === "moderador" || role === "apresentador") || role === "supervisor";
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

    return followUpsAtivosRows

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
        if (isCloserView && (!myCloserId || f.closerId !== myCloserId)) return false;
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
  }, [followUpsAtivosRows, agMap, closerMap, fuFilterCloser, fuFilterMotivo, fuFilterDate, fuFilterStatus, fuSort, isCloserView, myCloserId]);

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
      queryClient.invalidateQueries({ queryKey: ["vendas-tab-fechadas"] });
      queryClient.invalidateQueries({ queryKey: ["vendas-tab-nao-fechou"] });
      queryClient.invalidateQueries({ queryKey: ["vendas-tab-follow-ups"] });

      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    }
  };

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  // Drill-down state
  const [drill, setDrill] = useState<DrilldownState>({ open: false, title: "", ids: [] });
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const openDrill = (title: string, ids: string[], subtitle?: string) =>
    setDrill({ open: true, title, ids, subtitle });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">
          Vendas — {dayLabel}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({isRange ? `${format(parseISO(periodFrom), "dd/MM/yyyy")} a ${format(parseISO(periodTo), "dd/MM/yyyy")}` : format(parseISO(periodFrom), "dd/MM/yyyy")})
          </span>
        </h2>
        <div className="flex items-center gap-3">
          {(role === "gestor" || (role === "moderador" || role === "apresentador")) && (
            <Button size="sm" onClick={() => setAvulsaOpen(true)} className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Nova venda avulsa
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Atualizado em {format(new Date(), "HH:mm")}
          </p>
        </div>
      </div>
      <AvulsaSaleDialog open={avulsaOpen} onOpenChange={setAvulsaOpen} />



      {/* KPIs principais (clicáveis) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">


        <KpiCard
          icon={Target}
          label="Taxa de Conversão"
          value={erroConversao ? "—" : `${taxaConversao.toFixed(1)}%`}
          sub={
            erroConversao
              ? "Não foi possível calcular agora. Tente atualizar a página."
              : `${totalVendasConv} de ${totalReunioesConv} calls (exclui 2ªs reuniões e calls interrompidas · vendas atribuídas à data da 1ª call)`
          }
          color="primary"
          loading={loadingConversao}
          onClick={() =>
            openDrill(
              `Reuniões com resultado — ${dayLabel}`,
              conversaoIds,
              `Taxa de conversão: ${taxaConversao.toFixed(1)}%`,
            )
          }
        />
        {/* Métrica "Oferta de Preço" ocultada temporariamente — dados preservados. */}



        <KpiCard
          icon={DollarSign}
          label="Coletado Total"
          value={fmtBRL(coletadoTotal)}
          sub={
            totalVendasAvulsas > 0
              ? `Calls ${fmtBRL(coletadoCalls)} · Avulsas ${fmtBRL(coletadoAvulsa)} (${totalVendasAvulsas}) — fechado no período`
              : `${totalVendas} venda${totalVendas !== 1 ? "s" : ""} fechada${totalVendas !== 1 ? "s" : ""} no período`
          }
          color="emerald"
          loading={loadingVendas}
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
          loading={loadingVendas}
          onClick={() =>
            openDrill(`Coletado médio — ${dayLabel}`, fechadasIds, fmtBRL(coletadoMedio))
          }
        />
        <KpiCard
          icon={CheckCircle2}
          label="Vendas Fechadas"
          value={String(totalVendas)}
          sub={`${totalNaoFechou} não fechou em reuniões do período`}
          color="emerald"
          loading={loadingVendas}
          onClick={() =>
            openDrill(`Vendas fechadas — ${dayLabel}`, fechadasIds)
          }
        />
        <KpiCard
          icon={CalendarClock}
          label="Follow-ups Ativos"
          value={String(followUpsAgendados)}
          sub={`${followUpsHoje} hoje · ${followUpsAtrasados} atrasados (total geral)`}
          color={followUpsAtrasados > 0 ? "destructive" : "primary"}
          loading={loadingFollowUps}
          onClick={() =>
            openDrill(
              "Follow-ups ativos",
              followUpsAtivosIds,
              `${followUpsHoje} hoje · ${followUpsAtrasados} atrasados`,
            )
          }
        />
        <KpiCard
          icon={Phone}
          label="Vendas em 1ª Call"
          value={totalVendas > 0 ? `${pctPrimeiraCall.toFixed(0)}%` : "—"}
          sub={
            totalVendas > 0
              ? `${pctFollow.toFixed(0)}% precisou de follow-up/2ª (${fechadasFollowIds.length} de ${totalVendas})`
              : "Sem vendas no período"
          }
          color="primary"
          loading={loadingVendas}
          onClick={() =>
            openDrill(
              `Vendas em 1ª Call — ${dayLabel}`,
              fechadasPrimeiraCallIds,
              totalVendas > 0 ? `${pctPrimeiraCall.toFixed(0)}% fecharam na 1ª call` : undefined,
            )
          }
        />
      </div>

      {vendasSemStatusRealizada > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-600 dark:text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {vendasSemStatusRealizada} venda{vendasSemStatusRealizada !== 1 ? "s" : ""} do período está{vendasSemStatusRealizada !== 1 ? "ão" : ""} em reuniõe{vendasSemStatusRealizada !== 1 ? "s" : ""} que ainda não foram marcadas como "Realizada" — os valores acima já contabilizam, mas o status precisa ser atualizado.
        </div>
      )}


      {/* Vendas subidas no período selecionado — independente do dia da reunião */}
      <VendasHojeCard
        vendas={vendasHoje}
        closerMap={closerMap}
        isCloserView={isCloserView}
        myCloserId={myCloserId}
        onOpenDrill={openDrill}
        periodFrom={uploadPeriod.from}
        periodTo={uploadPeriod.to}
        dayLabel={dayLabel}
      />


      {/* Tendência preditiva — apenas para gestores/moderadores */}
      {(role === "gestor" || (role === "moderador" || role === "apresentador") || role === "supervisor") && (
        <TrendCardVendas closerId={isCloserView ? myCloserId : null} />
      )}

      {/* Conversão por hora — restrito à gestão */}
      {(role === "gestor" || role === "moderador" || role === "supervisor") && (
        <ConversaoPorHoraCard
          range={{ from: convPeriodFrom, to: convPeriodTo }}
          closerId={isCloserView ? myCloserId : null}
        />
      )}


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Motivos de não fechamento */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Motivos de Não Fechamento
              </CardTitle>
              <div className="flex items-center gap-2">
                {!isCloserView && (
                  <Select value={motivosCloserFilter} onValueChange={setMotivosCloserFilter}>
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <SelectValue placeholder="Closer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os closers</SelectItem>
                      {activeClosers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={motivosChannelFilter} onValueChange={setMotivosChannelFilter}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os canais</SelectItem>
                    {motivosChannels.map((ch) => (
                      <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={motivosPrecoFilter} onValueChange={(v) => setMotivosPrecoFilter(v as "all" | "sim" | "nao")}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="Oferta de preço" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Com e sem oferta</SelectItem>
                    <SelectItem value="sim">Apenas com preço ofertado</SelectItem>
                    <SelectItem value="nao">Apenas sem oferta</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleDownloadMotivosCsv}
                  disabled={totalNaoFechouMotivos === 0 || downloadingCsv}
                  aria-label="Baixar CSV"
                  title="Baixar CSV dos leads não fechados"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Performance por Closer
              </CardTitle>
              <div className="flex items-center gap-1">
                {(["all", "Social Selling", "Tráfego Pago"] as const).map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    size="sm"
                    variant={closerChannelFilter === opt ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setCloserChannelFilter(opt)}
                  >
                    {opt === "all" ? "Geral" : opt === "Tráfego Pago" ? "Tráfego" : "Social Selling"}
                  </Button>
                ))}
              </div>
              <div className="w-full sm:w-auto">
                <Select value={closerSortKey} onValueChange={(v) => setCloserSortKey(v as typeof closerSortKey)}>
                  <SelectTrigger className="h-7 w-full sm:w-[200px] text-xs">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Ordenar por: Coletado (R$)</SelectItem>
                    <SelectItem value="conversao">Ordenar por: Taxa de conversão</SelectItem>
                    <SelectItem value="ticket">Ordenar por: Tíquete médio</SelectItem>
                    <SelectItem value="vendas">Ordenar por: Volume de vendas</SelectItem>
                    <SelectItem value="realizadas">Ordenar por: Reuniões realizadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {realizadasSemCloser > 0 && !isCloserView && (
              <p className="mb-2 text-xs text-muted-foreground">
                {realizadasSemCloser} reunião{realizadasSemCloser !== 1 ? "ões" : ""} realizada
                {realizadasSemCloser !== 1 ? "s" : ""} no período sem closer atribuído — fora deste quadro.
              </p>
            )}
            {loadingCloserPerf ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : closerPerf.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Nenhuma reunião realizada ou venda registrada neste período
                {closerChannelFilter !== "all" ? ` em ${closerChannelFilter}` : ""}.
              </p>

            ) : (

              <div className="space-y-2">
                {closerPerf.map((c) => {
                  const closerIds = vendasDia
                    .filter((v) => {
                      const ag = agMap.get(v.agendamento_id);
                      if (!v.vendeu || ag?.closer_id !== c.closerId) return false;
                      if (closerChannelFilter !== "all" && ag?.channel_type !== closerChannelFilter) return false;
                      return true;
                    })
                    .map((v) => v.agendamento_id);
                  return (
                    <button
                      key={c.closerId}
                      type="button"
                      disabled={closerIds.length === 0}
                      onClick={() => openDrill(`${c.name} — ${dayLabel}`, closerIds, fmtBRL(c.receita))}
                      className="w-full flex items-center justify-between p-2 rounded-md bg-muted/30 enabled:hover:bg-muted/60 transition-colors text-left disabled:cursor-default"
                    >

                      <div className="flex-1">
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.vendas} vendas · {c.total} reuniões · {c.conversao.toFixed(0)}% conv.
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-emerald-500">{fmtBRL(c.receita)}</p>
                        {c.vendas > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Tíquete médio: {fmtBRL(c.receita / c.vendas)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance por Produto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Performance por Produto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {produtoPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              Nenhum produto registrado nas calls deste período.
            </p>
          ) : (
            <div className="space-y-2">
              {produtoPerf.map((p) => {
                const ids = vendasDia
                  .filter((v) => ((v.produto && v.produto.trim()) || "Sem produto") === p.produto)
                  .map((v) => v.agendamento_id);
                return (
                  <button
                    key={p.produto}
                    type="button"
                    onClick={() => openDrill(`Produto: ${p.produto} — ${dayLabel}`, ids, `${p.vendas} de ${p.ofertas} ofertas · ${p.conversao.toFixed(0)}% conv.`)}
                    className="w-full flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{p.produto}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.ofertas} oferta{p.ofertas !== 1 ? "s" : ""} · {p.vendas} venda{p.vendas !== 1 ? "s" : ""} · {p.conversao.toFixed(0)}% conv.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-emerald-500">{fmtBRL(p.receita)}</p>
                      {p.vendas > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Tíquete médio: {fmtBRL(p.ticketMedio)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Agendas por Canal — inclui segundas reuniões */}
      <AgendasPorCanalPanel
        currentDate={currentDate}
        dateRange={dateRange}
        vendasFechadasNoPeriodo={vendasDia
          .filter((v) => v.vendeu)
          .map((v) => ({
            agendamento_id: v.agendamento_id,
            channel_type: agMap.get(v.agendamento_id)?.channel_type ?? null,
            valor: Number(v.valor) || 0,
          }))}
      />

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
  loading,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  color: "primary" | "emerald" | "destructive";
  onClick?: () => void;
  loading?: boolean;
}) {
  const colorClasses = {
    primary: "text-primary border-primary/30 bg-primary/5",
    emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
    destructive: "text-destructive border-destructive/30 bg-destructive/5",
  };
  return (
    <button
      type="button"
      onClick={loading ? undefined : onClick}
      className={cn(
        "rounded-lg border p-3 flex flex-col gap-1 text-left transition-all",
        loading ? "cursor-default" : "hover:scale-[1.02] hover:shadow-md cursor-pointer",
        colorClasses[color],
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {loading ? (
        <>
          <div className="h-8 w-20 rounded bg-muted animate-pulse" />
          <div className="h-3 w-full rounded bg-muted/70 animate-pulse" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </>
      )}
    </button>
  );
}


type VendaHojeItem = {
  agendamento_id: string;
  valor: number | null;
  follow_up: boolean;
  segunda_reuniao: boolean;
  venda_origem: string | null;
  scheduled_date: string;
  meeting_reason: string | null;
  closer_id: string | null;
  closed_at: string | null;
  updated_at: string;
};

function VendasHojeCard({
  vendas,
  closerMap,
  isCloserView,
  myCloserId,
  onOpenDrill,
  periodFrom,
  periodTo,
  dayLabel,
}: {
  vendas: VendaHojeItem[];
  closerMap: Map<string, string>;
  isCloserView: boolean;
  myCloserId: string | null;
  onOpenDrill: (title: string, ids: string[], subtitle?: string) => void;
  periodFrom: string;
  periodTo: string;
  dayLabel: string;
}) {
  // Data efetiva de "subida" da venda em BRT:
  //   - Se houver override manual (closed_at), respeita a data escolhida pelo gestor.
  //   - Caso contrário, usa updated_at (momento em que a venda foi registrada).
  const uploadDateOf = (v: VendaHojeItem) => (v.closed_at ? v.closed_at : brDateOf(v.updated_at));
  const inPeriod = (ymd: string) => ymd >= periodFrom && ymd <= periodTo;

  const filtered = useMemo(
    () =>
      vendas.filter((v) => {
        if (isCloserView && (!v.closer_id || v.closer_id !== myCloserId)) return false;
        return inPeriod(uploadDateOf(v));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, isCloserView, myCloserId, periodFrom, periodTo],
  );
  // Origem da venda: prioriza a marcação feita pelo closer no modal de resultado.
  // Vendas antigas (sem marcação) mantêm a heurística: reunião no período e sem follow-up/2ª = call.
  const isFollow = (v: VendaHojeItem) => {
    if (v.venda_origem === "follow_up") return true;
    if (v.venda_origem === "primeira_call") return false;
    return v.follow_up || v.segunda_reuniao || v.meeting_reason === "segunda_reuniao" || !inPeriod(v.scheduled_date);
  };
  const total = filtered.length;
  const followItems = filtered.filter(isFollow);
  const callItems = filtered.filter((v) => !isFollow(v));
  const receita = filtered.reduce((acc, v) => acc + (v.valor || 0), 0);
  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  const porCloser = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((v) => {
      if (!v.closer_id) return;
      m.set(v.closer_id, (m.get(v.closer_id) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([id, count]) => ({ name: closerMap.get(id) || "—", count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered, closerMap]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Vendas registradas — {dayLabel}
          <span className="text-xs font-normal text-muted-foreground">
            (independente do dia da reunião)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            Nenhuma venda registrada no período.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => onOpenDrill(`Vendas registradas — ${dayLabel}`, filtered.map((v) => v.agendamento_id), fmtBRL(receita))}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-left hover:shadow-md transition-all"
            >
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Total subidas no período</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{total}</div>
              <div className="text-xs text-muted-foreground">{fmtBRL(receita)} coletado</div>
            </button>
            <button
              type="button"
              onClick={() => onOpenDrill(`Vendas de 1ª call — ${dayLabel}`, callItems.map((v) => v.agendamento_id))}
              className="rounded-lg border p-3 text-left hover:shadow-md transition-all"
            >
              <div className="text-xs font-medium">De 1ª call</div>
              <div className="text-2xl font-bold">{callItems.length}</div>
              <div className="text-xs text-muted-foreground">Marcado pelo closer no resultado</div>
            </button>
            <button
              type="button"
              onClick={() => onOpenDrill(`Vendas de follow-up — ${dayLabel}`, followItems.map((v) => v.agendamento_id))}
              className="rounded-lg border p-3 text-left hover:shadow-md transition-all"
            >
              <div className="text-xs font-medium">De follow-up / 2ª reunião</div>
              <div className="text-2xl font-bold">{followItems.length}</div>
              <div className="text-xs text-muted-foreground">Marcado pelo closer no resultado</div>
            </button>

            <div className="rounded-lg border p-3">
              <div className="text-xs font-medium mb-1">Por closer</div>
              {porCloser.length === 0 ? (
                <div className="text-xs text-muted-foreground">—</div>
              ) : (
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {porCloser.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <span className="truncate">{c.name}</span>
                      <Badge variant="secondary" className="h-5 px-1.5">{c.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
