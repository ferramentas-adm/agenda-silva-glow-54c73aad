import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eachDayOfInterval, format, subDays } from "date-fns";
import { TrendingUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import TrendChart, { type TrendDatum, type TrendWindow } from "./TrendChart";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Painel de tendência de vendas e taxa de conversão.
 * Janela rolante independente do filtro de dia/intervalo da aba.
 */
export default function TrendCardVendas({ closerId }: { closerId?: string | null }) {
  const [windowDays, setWindowDays] = useState<TrendWindow>(30);

  const { data: ags = [] } = useQuery<
    { id: string; scheduled_date: string; status: string; closer_id: string | null }[]
  >({
    queryKey: ["trend-vendas-ags", windowDays, closerId ?? "all"],
    queryFn: async () => {
      const since = subDays(new Date(), windowDays - 1);
      const sinceYmd = format(since, "yyyy-MM-dd");
      let q = supabase
        .from("agendamentos")
        .select("id, scheduled_date, status, closer_id")
        .is("deleted_at", null)
        .eq("status", "realizada")
        .gte("scheduled_date", sinceYmd);
      if (closerId) q = q.eq("closer_id", closerId);
      const PAGE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as any[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const agIds = useMemo(() => ags.map((a) => a.id), [ags]);

  const { data: vendas = [] } = useQuery<
    { agendamento_id: string; vendeu: boolean; valor: number | null; motivo_nao_fechamento: string | null }[]
  >({
    queryKey: ["trend-vendas-vendas", agIds.join(",")],
    enabled: agIds.length > 0,
    queryFn: async () => {
      const out: any[] = [];
      const CHUNK = 500;
      for (let i = 0; i < agIds.length; i += CHUNK) {
        const chunk = agIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendas")
          .select("agendamento_id, vendeu, valor, motivo_nao_fechamento, created_at")
          .in("agendamento_id", chunk)
          .order("created_at", { ascending: false });
        if (error) throw error;
        out.push(...(data ?? []));
      }
      // 1 venda por agendamento (mais recente vence)
      const map = new Map<string, any>();
      out.forEach((v) => {
        if (!map.has(v.agendamento_id)) map.set(v.agendamento_id, v);
      });
      return Array.from(map.values());
    },
    staleTime: 60_000,
  });

  const data = useMemo<TrendDatum[]>(() => {
    const end = new Date();
    const start = subDays(end, windowDays - 1);
    const days = eachDayOfInterval({ start, end });

    const vendaByAg = new Map(vendas.map((v) => [v.agendamento_id, v]));
    type Bucket = { realizadas: number; vendas: number; faturamento: number };
    const buckets = new Map<string, Bucket>();

    ags.forEach((a) => {
      const v = vendaByAg.get(a.id);
      const motivo = (v?.motivo_nao_fechamento || "").trim().toLowerCase();
      // Exclui Call Interompida/Interrompida do denominador (alinhado à aba)
      const isCallInterrompida =
        v && !v.vendeu && (motivo === "call interompida" || motivo === "call interrompida");
      if (isCallInterrompida) return;

      const b = buckets.get(a.scheduled_date) || { realizadas: 0, vendas: 0, faturamento: 0 };
      b.realizadas += 1;
      if (v?.vendeu) {
        b.vendas += 1;
        b.faturamento += Number(v.valor || 0);
      }
      buckets.set(a.scheduled_date, b);
    });

    return days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const b = buckets.get(key) || { realizadas: 0, vendas: 0, faturamento: 0 };
      const conversao = b.realizadas > 0 ? (b.vendas / b.realizadas) * 100 : 0;
      return {
        date: key,
        vendas: b.vendas,
        faturamento: Math.round(b.faturamento),
        conversao: Number(conversao.toFixed(1)),
      };
    });
  }, [ags, vendas, windowDays]);

  return (
    <TrendChart
      title={`Tendência de conversão — ${windowDays} dias`}
      icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
      data={data}
      primaryKey="conversao"
      series={[
        {
          key: "conversao",
          label: "Taxa de conversão (%)",
          color: "hsl(38 92% 50%)",
          type: "line",
          format: (v) => `${v.toFixed(1)}%`,
        },
      ]}
      windowDays={windowDays}
      onWindowChange={setWindowDays}
      showMovingAverage={false}
      showTrendline
      showComparison={false}
      emptyMessage="Sem reuniões realizadas no período."
    />
  );
}
