import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isSameDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, DollarSign, Target, CalendarClock, AlertTriangle, CheckCircle2, Receipt,
  Filter, X, CalendarIcon, Pencil, Trash2, Loader2, Download, Phone,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { brDateOf, formatBRDateTime } from "@/lib/timezone";
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
import AgendasPorCanalPanel from "@/components/dashboard/AgendasPorCanalPanel";
import FollowUpEditDialog, { removeFollowUp, type FollowUpEditTarget } from "@/components/FollowUpEditDialog";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS } from "@/lib/vendaConstants";

interface VendaRow {
  id: string;
  agendamento_id: string;
  vendeu: boolean;
  valor: number | null;
  produto: string | null;
  follow_up: boolean;
  follow_up_date: string | null;
  follow_up_time: string | null;
  segunda_reuniao: boolean;
  motivo_nao_fechamento: string | null;
  explicacao_nao_fechamento: string | null;
  resumo_venda: string | null;
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
  briefing: string | null;
  created_at: string;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  status: string;
  meeting_reason: string | null;

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

  // Janela server-side: cobre vendas e audit_logs com folga em torno do
  // período selecionado. Evita baixar a tabela inteira a cada refetch.
  // - Modo intervalo: usa o range escolhido com 60 dias de folga p/ trás (para
  //   capturar reuniões antigas cujo follow-up fechou dentro do range).
  // - Modo dia único: janela ampla padrão (180 dias atrás → 60 dias à frente).
  const windowRange = useMemo(() => {
    const pad = (d: Date) => format(d, "yyyy-MM-dd");
    if (isRange && dateRange?.from && dateRange?.to) {
      const start = new Date(dateRange.from); start.setDate(start.getDate() - 60);
      const end = new Date(dateRange.to); end.setDate(end.getDate() + 7);
      return { start: pad(start), end: pad(end) };
    }
    const base = new Date(currentDate);
    const start = new Date(base); start.setDate(start.getDate() - 180);
    const end = new Date(base); end.setDate(end.getDate() + 60);
    return { start: pad(start), end: pad(end) };
  }, [currentDate, isRange, dateRange?.from, dateRange?.to]);

  // Vendas: limitadas a uma janela de datas server-side; ainda paginamos
  // para acomodar volumes maiores que 1.000 linhas dentro da janela.
  const { data: vendas = [] } = useQuery<VendaRow[]>({
    queryKey: ["vendas-tab", windowRange.start, windowRange.end],
    queryFn: async () => {
      const PAGE = 1000;
      const all: VendaRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("vendas")
          .select(`
            id, agendamento_id, vendeu, valor, produto, follow_up, follow_up_date, follow_up_time, segunda_reuniao,
            motivo_nao_fechamento, explicacao_nao_fechamento, resumo_venda, observacoes, closed_at, created_at, updated_at,
            agendamentos!inner(id, closer_id, scheduled_date, scheduled_time, lead_name, lead_phone, channel_type, briefing, created_at, created_by, sdr_responsavel_id, status, meeting_reason)
          `)

          .is("agendamentos.deleted_at", null)
          .gte("agendamentos.scheduled_date", windowRange.start)
          .lte("agendamentos.scheduled_date", windowRange.end)
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
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // Mapa agendamento_id -> data (BRT yyyy-MM-dd) em que a venda foi marcada
  // como fechada via follow-up. Usa o audit log com outcome='fechou'.
  const { data: followUpCloseDateMap = new Map<string, string>() } = useQuery<Map<string, string>>({
    queryKey: ["vendas-tab-followup-closes", windowRange.start, windowRange.end],
    queryFn: async () => {
      const PAGE = 1000;
      const rows: { entity_id: string | null; details: any; created_at: string }[] = [];
      let from = 0;
      // Filtra audit_logs por created_at dentro da janela para evitar full scan.
      const startIso = `${windowRange.start}T00:00:00Z`;
      const endIso = `${windowRange.end}T23:59:59Z`;
      while (true) {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("entity_id, details, created_at")
          .eq("entity_type", "venda")
          .eq("action", "follow_up_atualizado")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as typeof rows;
        rows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      const m = new Map<string, string>();
      rows.forEach((r) => {
        if (!r.entity_id) return;
        if ((r.details?.outcome ?? "") !== "fechou") return;
        const cur = m.get(r.entity_id);
        if (!cur || cur < r.created_at) m.set(r.entity_id, brDateOf(r.created_at));
      });
      return m;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const { data: closers = [] } = useQuery<(CloserRow & { email: string | null })[]>({
    queryKey: ["vendas-tab-closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name, email").eq("active", true).order("name");
      return (data ?? []) as (CloserRow & { email: string | null })[];
    },
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

  // Vendas do período selecionado (dia único OU intervalo). Para closer logado,
  // aplica filtro adicional para mostrar apenas seus próprios números.
  const vendasDia = useMemo(() => {
    return vendas.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (ag?.status !== "realizada") return false;
      if (isCloserView) {
        if (!myCloserId || ag?.closer_id !== myCloserId) return false;
      }
      const cd = closingDateOf(v);
      if (!cd) return false;
      if (isRange && rangeFromStr && rangeToStr) {
        return cd >= rangeFromStr && cd <= rangeToStr;
      }
      return cd === dateStr;
    });
  }, [vendas, agMap, followUpCloseDateMap, dateStr, isRange, rangeFromStr, rangeToStr, isCloserView, myCloserId]);

  // Base do card "Taxa de Conversão": busca AGENDAMENTOS realizados no período
  // direto da tabela `agendamentos` (independente da existência de linha em `vendas`).
  // Isso garante que o denominador case com o total operacional do calendário,
  // incluindo reuniões criadas por closer. Exclui apenas Call Interompida/Interrompida.
  const convPeriodFrom = isRange && rangeFromStr ? rangeFromStr : dateStr;
  const convPeriodTo = isRange && rangeToStr ? rangeToStr : dateStr;
  const { data: conversaoData } = useQuery<{ totalReunioes: number; totalVendas: number; ids: string[] }>({
    queryKey: ["vendas-tab-conversao", convPeriodFrom, convPeriodTo, isCloserView, myCloserId],
    queryFn: async () => {
      // 1) Busca agendamentos realizados no período (paginado)
      const PAGE = 1000;
      const ags: { id: string; closer_id: string | null }[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from("agendamentos")
          .select("id, closer_id")
          .is("deleted_at", null)
          .eq("status", "realizada")
          .gte("scheduled_date", convPeriodFrom)
          .lte("scheduled_date", convPeriodTo)
          .range(from, from + PAGE - 1);
        if (isCloserView && myCloserId) q = q.eq("closer_id", myCloserId);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as { id: string; closer_id: string | null }[];
        ags.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      if (ags.length === 0) return { totalReunioes: 0, totalVendas: 0, ids: [] };

      // 2) Busca vendas (vendeu + motivo) desses agendamentos
      const ids = ags.map((a) => a.id);
      const vendasMap = new Map<string, { vendeu: boolean; motivo: string }>();
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendas")
          .select("agendamento_id, vendeu, motivo_nao_fechamento, created_at")
          .in("agendamento_id", chunk)
          .order("created_at", { ascending: false });
        if (error) throw error;
        (data ?? []).forEach((v: any) => {
          // 1 linha por agendamento (mais recente vence)
          if (!vendasMap.has(v.agendamento_id)) {
            vendasMap.set(v.agendamento_id, {
              vendeu: !!v.vendeu,
              motivo: (v.motivo_nao_fechamento || "").trim().toLowerCase(),
            });
          }
        });
      }

      // 3) Filtra Call Interompida/Interrompida do denominador
      const validos = ags.filter((a) => {
        const v = vendasMap.get(a.id);
        if (!v) return true;
        if (!v.vendeu && (v.motivo === "call interompida" || v.motivo === "call interrompida")) return false;
        return true;
      });
      const totalVendas = validos.filter((a) => vendasMap.get(a.id)?.vendeu).length;
      return { totalReunioes: validos.length, totalVendas, ids: validos.map((a) => a.id) };
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // KPIs (memoizados para não recalcular em cada render)
  const kpis = useMemo(() => {
    const totalReunioesComResultado = vendasDia.length;
    const totalVendas = vendasDia.filter((v) => v.vendeu).length;
    const totalNaoFechou = vendasDia.filter((v) => !v.vendeu).length;
    // Taxa de conversão: numerador usa vendas efetivamente fechadas no período
    // (closed_at/follow-up/data efetiva), enquanto o denominador mantém as
    // reuniões realizadas do período. Assim vendas de follow-up fechadas hoje
    // entram na taxa de hoje, mesmo que a reunião original tenha sido ontem.
    const totalReunioesConv = conversaoData?.totalReunioes ?? 0;
    const totalVendasConv = totalVendas;
    const taxaConversao = totalReunioesConv > 0 ? (totalVendasConv / totalReunioesConv) * 100 : 0;
    const coletadoTotal = vendasDia
      .filter((v) => v.vendeu && v.valor)
      .reduce((acc, v) => acc + (v.valor || 0), 0);
    const coletadoMedio = totalVendas > 0 ? coletadoTotal / totalVendas : 0;

    // % de vendas em 1a call vs follow-up/2a reuniao
    const isSegunda = (v: VendaRow) => v.segunda_reuniao || agMap.get(v.agendamento_id)?.meeting_reason === "segunda_reuniao";
    const vendasPrimeiraCall = vendasDia.filter((v) => v.vendeu && !v.follow_up && !isSegunda(v)).length;
    const vendasFollowOuSegunda = vendasDia.filter((v) => v.vendeu && (v.follow_up || isSegunda(v))).length;
    const pctPrimeiraCall = totalVendas > 0 ? (vendasPrimeiraCall / totalVendas) * 100 : 0;
    const pctFollow = totalVendas > 0 ? (vendasFollowOuSegunda / totalVendas) * 100 : 0;

    // % de calls com oferta de preço: numerador = realizadas (vendasDia) com
    // valor > 0 OU vendeu (toda venda fechada implica preço apresentado).
    const ofertasPreco = vendasDia.filter((v) => v.vendeu || (typeof v.valor === "number" && (v.valor || 0) > 0));
    const ofertasPrecoCount = ofertasPreco.length;
    const ofertasPrecoIds = ofertasPreco.map((v) => v.agendamento_id);
    const pctOfertaPreco = totalReunioesConv > 0 ? (ofertasPrecoCount / totalReunioesConv) * 100 : 0;

    return { totalReunioesComResultado, totalVendas, totalNaoFechou, taxaConversao, totalReunioesConv, totalVendasConv, coletadoTotal, coletadoMedio, pctPrimeiraCall, pctFollow, ofertasPrecoCount, ofertasPrecoIds, pctOfertaPreco };
  }, [vendasDia, conversaoData, agMap]);

  const { totalReunioesComResultado, totalVendas, totalNaoFechou, taxaConversao, totalReunioesConv, totalVendasConv, coletadoTotal, coletadoMedio, pctPrimeiraCall, pctFollow, ofertasPrecoCount, ofertasPrecoIds, pctOfertaPreco } = kpis;


  // Follow-ups (escopo geral — não dependem do dia selecionado).
  // Para closer logado, aplica filtro adicional para mostrar apenas seus próprios follow-ups.
  const followUpStats = useMemo(() => {
    const ativos = vendas.filter((v) => {
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
  }, [vendas, todayStr, isCloserView, myCloserId, agMap]);
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
      if (ag?.status !== "realizada") return false;
      if (isCloserView) {
        if (!myCloserId || ag?.closer_id !== myCloserId) return false;
      }
      const cd = closingDateOf(v);
      if (!cd) return false;
      if (isRange && rangeFromStr && rangeToStr) {
        return cd >= rangeFromStr && cd <= rangeToStr;
      }
      return cd === dateStr;
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
  }, [vendas, agMap, dateStr, isRange, rangeFromStr, rangeToStr, isCloserView, myCloserId, motivosCloserFilter, motivosChannelFilter, motivosPrecoFilter]);

  const totalNaoFechouMotivos = vendasDiaParaMotivos.filter((v) => !v.vendeu).length;

  // Download CSV dos leads que estão na seção "Motivos de Não Fechamento"
  const handleDownloadMotivosCsv = () => {
    const rows = vendasDiaParaMotivos.filter((v) => !v.vendeu);
    if (rows.length === 0) return;

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
        v.explicacao_nao_fechamento ?? "",
        v.resumo_venda ?? "",
        ag?.briefing ?? "",
        v.observacoes ?? "",
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

  // Filtro de canal aplicado à Performance por Closer
  const [closerChannelFilter, setCloserChannelFilter] = useState<"all" | "Social Selling" | "Tráfego Pago">("all");

  // Performance por Closer (com filtro opcional de canal)
  // Exclui Call Interrompida/Interompida e segundas reuniões do total de reuniões.
  const closerPerf = useMemo(() => {
    const map = new Map<string, { vendas: number; naoFechou: number; receita: number }>();
    vendasDia.forEach((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (!ag?.closer_id) return;
      if (closerChannelFilter !== "all" && ag.channel_type !== closerChannelFilter) return;
      // Excluir segundas reuniões
      if (v.segunda_reuniao || ag.meeting_reason === "segunda_reuniao") return;
      // Excluir Call Interrompida do denominador
      const motivo = (v.motivo_nao_fechamento || "").trim().toLowerCase();
      if (!v.vendeu && (motivo === "call interompida" || motivo === "call interrompida")) return;
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
      .sort((a, b) => b.receita - a.receita);
  }, [vendasDia, agMap, closerMap, closerChannelFilter]);

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
  }, [vendas, agMap, closerMap, fuFilterCloser, fuFilterMotivo, fuFilterDate, fuFilterStatus, fuSort, isCloserView, myCloserId]);

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


      {/* KPIs principais (clicáveis) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">


        <KpiCard
          icon={Target}
          label="Taxa de Conversão"
          value={`${taxaConversao.toFixed(1)}%`}
          sub={`${totalVendasConv} de ${totalReunioesConv} realizadas (excl. interrompidas)`}
          color="primary"
          onClick={() =>
            openDrill(
              `Reuniões com resultado — ${dayLabel}`,
              conversaoIds,
              `Taxa de conversão: ${taxaConversao.toFixed(1)}%`,
            )
          }
        />
        <KpiCard
          icon={Target}
          label="Oferta de Preço"
          value={totalReunioesConv > 0 ? `${pctOfertaPreco.toFixed(0)}%` : "—"}
          sub={`${ofertasPrecoCount} de ${totalReunioesConv} realizadas com preço apresentado`}
          color="primary"
          onClick={() =>
            openDrill(
              `Calls com oferta de preço — ${dayLabel}`,
              ofertasPrecoIds,
              totalReunioesConv > 0 ? `${pctOfertaPreco.toFixed(0)}% das realizadas` : undefined,
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
          onClick={() =>
            openDrill(
              `Vendas em 1ª Call — ${dayLabel}`,
              fechadasPrimeiraCallIds,
              totalVendas > 0 ? `${pctPrimeiraCall.toFixed(0)}% fecharam na 1ª call` : undefined,
            )
          }
        />
      </div>

      {/* Tendência preditiva — apenas para gestores/moderadores */}
      {(role === "gestor" || role === "moderador") && (
        <TrendCardVendas closerId={isCloserView ? myCloserId : null} />
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
                      {closers.map((c) => (
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
                  disabled={totalNaoFechouMotivos === 0}
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
            </div>
          </CardHeader>
          <CardContent>
            {closerPerf.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Nenhuma venda registrada neste dia
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
