import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, PlusCircle, Search, TrendingDown, Coins } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { formatBRDate } from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ComplementoDialog, { type ComplementoTarget } from "@/components/dashboard/ComplementoDialog";
import { SALDO_RESIDUAL_FROM } from "@/components/dashboard/VendasTab";

interface SaldoRow {
  venda_id: string;
  agendamento_id: string;
  lead_name: string | null;
  closer_id: string | null;
  closer_name: string | null;
  produto: string | null;
  closed_at: string | null;
  faturado: number;
  coletado_base: number;
  complementos_total: number;
  coletado_acumulado: number;
  saldo: number;
  qtd_complementos: number;
  is_venda_avulsa: boolean;
}

const PAGE_SIZE = 50;

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Aba "Saldo Residual": vendas com saldo em aberto
 * (valor_total_projeto − coletado acumulado). Agregação feita no banco via
 * RPCs `dashboard_saldo_residual` / `dashboard_saldo_residual_totais`, então
 * o client recebe apenas a página visível.
 */
export default function SaldoResidualTab() {
  const { role } = useAuth();
  const canManage =
    role === "gestor" || role === "moderador" || role === "supervisor" || role === "apresentador";

  const [order, setOrder] = useState<"saldo" | "antiga">("saldo");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<ComplementoTarget | null>(null);

  const { data: rows = [], isLoading } = useQuery<SaldoRow[]>({
    queryKey: ["saldo-residual", order, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_saldo_residual", {
        p_closer_id: null,
        p_order: order,
        p_from: SALDO_RESIDUAL_FROM,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        faturado: Number(r.faturado) || 0,
        coletado_base: Number(r.coletado_base) || 0,
        complementos_total: Number(r.complementos_total) || 0,
        coletado_acumulado: Number(r.coletado_acumulado) || 0,
        saldo: Number(r.saldo) || 0,
        qtd_complementos: Number(r.qtd_complementos) || 0,
      })) as SaldoRow[];
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: totais } = useQuery<{
    total_faturado: number; total_coletado_acumulado: number; total_saldo: number; qtd_vendas: number;
  } | null>({
    queryKey: ["saldo-residual-totais"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_saldo_residual_totais", {
        p_closer_id: null,
        p_from: SALDO_RESIDUAL_FROM,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!row) return null;
      return {
        total_faturado: Number(row.total_faturado) || 0,
        total_coletado_acumulado: Number(row.total_coletado_acumulado) || 0,
        total_saldo: Number(row.total_saldo) || 0,
        qtd_vendas: Number(row.qtd_vendas) || 0,
      };
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.lead_name ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={Coins} label="Faturado (vendas com saldo)" value={fmtBRL(totais?.total_faturado ?? 0)} tone="primary" />
        <SummaryCard icon={Wallet} label="Coletado acumulado" value={fmtBRL(totais?.total_coletado_acumulado ?? 0)} tone="emerald" />
        <SummaryCard
          icon={TrendingDown}
          label="Saldo a receber"
          value={fmtBRL(totais?.total_saldo ?? 0)}
          sub={`${totais?.qtd_vendas ?? 0} venda${(totais?.qtd_vendas ?? 0) !== 1 ? "s" : ""} em aberto`}
          tone="amber"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Vendas com saldo em aberto</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar lead..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-44 pl-7 text-sm"
              />
            </div>
            <Select value={order} onValueChange={(v) => { setOrder(v as "saldo" | "antiga"); setPage(0); }}>
              <SelectTrigger className="h-9 w-52 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saldo">Ordenar por: maior saldo</SelectItem>
                <SelectItem value="antiga">Ordenar por: mais antiga</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma venda com saldo em aberto.
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div
                  key={r.venda_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{r.lead_name ?? "—"}</span>
                      {r.is_venda_avulsa && <Badge variant="outline" className="text-[10px]">Avulsa</Badge>}
                      {r.produto && <Badge variant="secondary" className="text-[10px]">{r.produto}</Badge>}
                      {r.qtd_complementos > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.qtd_complementos} complemento{r.qtd_complementos !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.closer_name ?? "Sem closer"}
                      {r.closed_at ? ` · fechada em ${formatBRDate(r.closed_at + "T12:00:00")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Faturado</p>
                      <p className="text-sm font-medium">{fmtBRL(r.faturado)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Coletado</p>
                      <p className="text-sm font-medium text-emerald-600">{fmtBRL(r.coletado_acumulado)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Saldo</p>
                      <p className="text-sm font-bold text-amber-600">{fmtBRL(r.saldo)}</p>
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTarget({
                            vendaId: r.venda_id,
                            leadName: r.lead_name,
                            faturado: r.faturado,
                            coletadoAcumulado: r.coletado_acumulado,
                          })
                        }
                      >
                        <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                        Complemento
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">Página {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </CardContent>
      </Card>

      <ComplementoDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        target={target}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "emerald" | "amber";
}) {
  const tones = {
    primary: "text-primary border-primary/30 bg-primary/5",
    emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
    amber: "text-amber-500 border-amber-500/30 bg-amber-500/5",
  };
  return (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-1", tones[tone])}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
