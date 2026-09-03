import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, PlusCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/services/auditLog";
import { brTodayYMD, formatBRDate } from "@/lib/timezone";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ComplementoTarget {
  vendaId: string;
  leadName?: string | null;
  faturado?: number | null;
  coletadoAcumulado?: number | null;
}

interface Complemento {
  id: string;
  valor: number;
  data_pagamento: string;
  observacoes: string | null;
  created_at: string;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatBRLDigits = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return "";
  const padded = cleaned.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const cents = padded.slice(-2);
  return `${reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
};

const digitsToNumber = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return NaN;
  return parseInt(cleaned, 10) / 100;
};

/**
 * Dialog de lançamento de pagamentos complementares (parcelas recebidas após
 * o fechamento da venda). Escrita restrita a gestor/moderador/supervisor/
 * apresentador — o RLS de `venda_complementos` é a camada definitiva.
 */
export default function ComplementoDialog({
  open, onOpenChange, target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ComplementoTarget | null;
}) {
  const { role } = useAuth();
  const canManage =
    role === "gestor" || role === "moderador" || role === "supervisor" || role === "apresentador";
  const queryClient = useQueryClient();

  const [valor, setValor] = useState("");
  const [dataPagamento, setDataPagamento] = useState(brTodayYMD());
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValor("");
      setDataPagamento(brTodayYMD());
      setObservacoes("");
    }
  }, [open, target?.vendaId]);

  const { data: complementos = [], isLoading } = useQuery<Complemento[]>({
    queryKey: ["complementos-venda", target?.vendaId],
    enabled: open && !!target?.vendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venda_complementos")
        .select("id, valor, data_pagamento, observacoes, created_at")
        .eq("venda_id", target!.vendaId)
        .order("data_pagamento", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, valor: Number(r.valor) })) as Complemento[];
    },
  });

  const totalComplementos = complementos.reduce((s, c) => s + c.valor, 0);
  const valorNum = digitsToNumber(valor);
  const canSubmit = canManage && !isNaN(valorNum) && valorNum > 0 && !!dataPagamento;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["complementos-venda"] }),
      queryClient.invalidateQueries({ queryKey: ["saldo-residual"] }),
      queryClient.invalidateQueries({ queryKey: ["saldo-residual-totais"] }),
      queryClient.invalidateQueries({ queryKey: ["vendas-tab-complementos"] }),
      queryClient.invalidateQueries({ queryKey: ["vendas-tab-saldo"] }),
    ]);
  };

  const handleSubmit = async () => {
    if (!target || !canSubmit) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("venda_complementos").insert([{
      venda_id: target.vendaId,
      valor: valorNum,
      data_pagamento: dataPagamento,
      observacoes: observacoes.trim() || null,
      criado_por: user?.id as string,
    }]);
    setSaving(false);
    if (error) {
      toast.error("Erro ao lançar complemento: " + error.message);
      return;
    }
    await logAudit("complemento_lancado", "venda", target.vendaId, {
      valor: valorNum,
      data_pagamento: dataPagamento,
      lead_name: target.leadName ?? null,
    });
    toast.success("Complemento lançado");
    setValor("");
    setObservacoes("");
    await invalidate();
  };

  const handleRemove = async (id: string, valorRemovido: number) => {
    setRemovingId(id);
    const { error } = await supabase.from("venda_complementos").delete().eq("id", id);
    setRemovingId(null);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    await logAudit("complemento_removido", "venda", target?.vendaId, { valor: valorRemovido });
    toast.success("Complemento removido");
    await invalidate();
  };

  const faturado = Number(target?.faturado ?? 0);
  const coletadoBase = Number(target?.coletadoAcumulado ?? 0);
  const saldo = faturado - coletadoBase;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar complemento</DialogTitle>
          <DialogDescription>
            {target?.leadName ? `${target.leadName} — ` : ""}
            pagamentos recebidos após o fechamento da venda.
          </DialogDescription>
        </DialogHeader>

        {faturado > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <p className="text-[10px] uppercase text-muted-foreground">Faturado</p>
              <p className="text-sm font-semibold">{fmtBRL(faturado)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-[10px] uppercase text-muted-foreground">Coletado acum.</p>
              <p className="text-sm font-semibold text-emerald-600">{fmtBRL(coletadoBase)}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-[10px] uppercase text-muted-foreground">Saldo</p>
              <p className="text-sm font-semibold text-amber-600">{fmtBRL(Math.max(saldo, 0))}</p>
            </div>
          </div>
        )}

        {canManage && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor recebido *</Label>
                <Input
                  inputMode="numeric"
                  placeholder="0,00"
                  value={formatBRLDigits(valor)}
                  onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data do pagamento *</Label>
                <Input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                placeholder="Ex.: 2ª parcela via PIX"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Complementos lançados {complementos.length > 0 && `· ${fmtBRL(totalComplementos)}`}
          </p>
          {isLoading ? (
            <div className="h-10 rounded bg-muted animate-pulse" />
          ) : complementos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum complemento lançado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {complementos.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fmtBRL(c.valor)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBRDate(c.data_pagamento + "T12:00:00")}
                      {c.observacoes ? ` · ${c.observacoes}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={removingId === c.id}
                      onClick={() => handleRemove(c.id, c.valor)}
                      title="Remover complemento"
                    >
                      {removingId === c.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {canManage && (
            <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              Lançar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
