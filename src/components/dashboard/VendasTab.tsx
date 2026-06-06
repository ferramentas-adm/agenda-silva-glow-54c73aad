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
            id, agendamento_id, vendeu, valor, follow_up, follow_up_date, follow_up_time, segunda_reuniao,
            motivo_nao_fechamento, explicacao_nao_fechamento, resumo_venda, observacoes, closed_at, created_at, updated_at,
            agendamentos!inner(id, closer_id, scheduled_date, scheduled_time, lead_name, lead_phone, channel_type, briefing, created_at, created_by, sdr_responsavel_id, status)
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


  // KPIs (memoizados para não recalcular em cada render)
  const kpis = useMemo(() => {
    const totalReunioesComResultado = vendasDia.length;
    const totalVendas = vendasDia.filter((v) => v.vendeu).length;
    const totalNaoFechou = vendasDia.filter((v) => !v.vendeu).length;
    const taxaConversao = totalReunioesComResultado > 0 ? (totalVendas / totalReunioesComResultado) * 100 : 0;
    const coletadoTotal = vendasDia
      .filter((v) => v.vendeu && v.valor)
      .reduce((acc, v) => acc + (v.valor || 0), 0);
    const coletadoMedio = totalVendas > 0 ? coletadoTotal / totalVendas : 0;

    // % de vendas em 1a call vs follow-up/2a reuniao
    const isSegunda = (v: Venda) => v.segunda_reuniao || agMap.get(v.agendamento_id)?.meeting_reason === "segunda_reuniao";
    const vendasPrimeiraCall = vendasDia.filter((v) => v.vendeu && !v.follow_up && !isSegunda(v)).length;
    const vendasFollowOuSegunda = vendasDia.filter((v) => v.vendeu && (v.follow_up || isSegunda(v))).length;
    const pctPrimeiraCall = totalVendas > 0 ? (vendasPrimeiraCall / totalVendas) * 100 : 0;
    const pctFollow = totalVendas > 0 ? (vendasFollowOuSegunda / totalVendas) * 100 : 0;

    return { totalReunioesComResultado, totalVendas, totalNaoFechou, taxaConversao, coletadoTotal, coletadoMedio, pctPrimeiraCall, pctFollow };
  }, [vendasDia, agMap]);

  const { totalReunioesComResultado, totalVendas, totalNaoFechou, taxaConversao, coletadoTotal, coletadoMedio, pctPrimeiraCall, pctFollow } = kpis;

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
  const drilldownIds = useMemo(() => ({
    vendasDiaIds: vendasDia.map((v) => v.agendamento_id),
    fechadasIds: vendasDia.filter((v) => v.vendeu).map((v) => v.agendamento_id),
    fechadasPrimeiraCallIds: vendasDia.filter((v) => v.vendeu && !v.follow_up && !v.segunda_reuniao).map((v) => v.agendamento_id),
    fechadasFollowIds: vendasDia.filter((v) => v.vendeu && (v.follow_up || v.segunda_reuniao)).map((v) => v.agendamento_id),
    naoFechouIds: vendasDia.filter((v) => !v.vendeu).map((v) => v.agendamento_id),
  }), [vendasDia]);
  const { vendasDiaIds, fechadasIds, fechadasPrimeiraCallIds, fechadasFollowIds, naoFechouIds } = drilldownIds;

  // Filtros do card "Motivos de Não Fechamento"
  const [motivosCloserFilter, setMotivosCloserFilter] = useState<string>("all");
  const [motivosChannelFilter, setMotivosChannelFilter] = useState<string>("all");

  // Canais disponíveis nas vendas do período (para o filtro)
  const motivosChannels = useMemo(() => {
    const set = new Set<string>();
    vendasDia.forEach((v) => {
      const ch = agMap.get(v.agendamento_id)?.channel_type;
      if (ch) set.add(ch);
    });
    return Array.from(set).sort();
  }, [vendasDia, agMap]);

  // Vendas que entram no card de motivos (filtradas opcionalmente por closer e canal)
  const vendasDiaParaMotivos = useMemo(() => {
    return vendasDia.filter((v) => {
      const ag = agMap.get(v.agendamento_id);
      if (motivosCloserFilter !== "all" && ag?.closer_id !== motivosCloserFilter) return false;
      if (motivosChannelFilter !== "all" && ag?.channel_type !== motivosChannelFilter) return false;
      return true;
    });
  }, [vendasDia, agMap, motivosCloserFilter, motivosChannelFilter]);

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


      {/* KPIs principais (5 cards, todos clicáveis) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

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
        <KpiCard
          icon={Phone}
          label="Vendas em 1ª Call"
          value={totalVendas > 0 ? `${pctPrimeiraCall.toFixed(0)}%` : "—"}
          sub={
            totalVendas > 0
              ? `${pctFollow.toFixed(0)}% precisou de follow-up/2ª (${vendasDia.filter((v) => v.vendeu && (v.follow_up || v.segunda_reuniao)).length} de ${totalVendas})`
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
            {!isCloserView && (
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
            )}
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
