import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, DollarSign, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { logAudit } from "@/services/auditLog";
import { sendVendaToDataCrazy } from "@/services/datacrazyVenda";
import { brTodayYMD } from "@/lib/timezone";
import OrderBumpsField from "@/components/OrderBumpsField";
import { OrderBump, orderBumpsTotal, parseOrderBumpsColumn } from "@/lib/orderBumps";

interface GestorVendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamentoId: string;
  leadName: string;
  currentStatus?: string | null;
  /** Valores sugeridos quando ainda não existe venda lançada (ex.: vindo do modal de venda avulsa). */
  prefill?: { produto?: string | null; valorDigits?: string | null };
  /** Chamado após salvar/remover. `status` = novo status da agenda. */
  onSuccess: (status: string) => void;
}

const formatBRL = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return "";
  const padded = cleaned.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const cents = padded.slice(-2);
  const reaisFmt = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${reaisFmt},${cents}`;
};

const digitsToNumber = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return NaN;
  return parseInt(cleaned, 10) / 100;
};

/**
 * Modal de GESTOR/MODERADOR/SUPERVISOR — lança a venda oficial.
 * Independente do closer: ao confirmar, a reunião é marcada como realizada
 * automaticamente e o status anterior é guardado para permitir reversão.
 */
export default function GestorVendaDialog({
  open, onOpenChange, agendamentoId, leadName, currentStatus, prefill, onSuccess,
}: GestorVendaDialogProps) {
  const { user } = useAuth();
  const { items: produtosList } = useAppSettingList(APP_SETTING_KEYS.produtos, []);

  const [produto, setProduto] = useState("");
  const [valor, setValor] = useState("");
  const [vendaOrigem, setVendaOrigem] = useState<"primeira_call" | "follow_up" | null>(null);
  const [orderBumps, setOrderBumps] = useState<OrderBump[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existing, setExisting] = useState<any | null>(null);
  // Closer creditado pela venda — pode ser diferente do closer da reunião
  // (ex.: outro closer ligou depois e fechou na ligação).
  const [closerOriginalId, setCloserOriginalId] = useState<string | null>(null);
  const [closerId, setCloserId] = useState("");
  const [closerJust, setCloserJust] = useState("");

  const { data: closers = [] } = useQuery({
    queryKey: ["gestor-venda-closers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const closerNameById = useMemo(
    () => new Map(closers.map((c) => [c.id, c.name])),
    [closers],
  );
  const closerTrocado = !!closerId && closerId !== closerOriginalId;
  const CLOSER_JUST_MIN = 20;

  const hasVenda = existing?.vendeu === true;

  const reset = () => {
    setProduto("");
    setValor("");
    setVendaOrigem(null);
    setOrderBumps([]);
    setExisting(null);
    setCloserOriginalId(null);
    setCloserId("");
    setCloserJust("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    reset();
    (async () => {
      setLoadingExisting(true);
      const { data: agRow } = await supabase
        .from("agendamentos")
        .select("closer_id")
        .eq("id", agendamentoId)
        .maybeSingle();
      setCloserOriginalId(agRow?.closer_id ?? null);
      setCloserId(agRow?.closer_id ?? "");
      const { data } = await supabase
        .from("vendas")
        .select("*")
        .eq("agendamento_id", agendamentoId)
        .maybeSingle();
      if (data) {
        setExisting(data);
        setProduto((data as any).produto ?? "");
        if (data.valor != null) setValor(Math.round(Number(data.valor) * 100).toString());
        const origem = (data as any).venda_origem;
        if (origem === "primeira_call" || origem === "follow_up") setVendaOrigem(origem);
        setOrderBumps(parseOrderBumpsColumn((data as { order_bumps?: unknown }).order_bumps));
      }
      // Sugestões vindas do modal de venda avulsa — só preenchem o que está vazio.
      if (prefill) {
        if (prefill.produto && !(data as any)?.produto) setProduto(prefill.produto);
        if (prefill.valorDigits && data?.valor == null) setValor(prefill.valorDigits);
      }
      setLoadingExisting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agendamentoId]);

  const valorNum = digitsToNumber(valor);
  const valorValido = !isNaN(valorNum) && valorNum > 0;
  const bumpsTotal = orderBumpsTotal(orderBumps);
  const valorTotalProjeto = valorValido ? valorNum + bumpsTotal : 0;
  const canSubmit =
    valorValido &&
    !!vendaOrigem &&
    (produtosList.length === 0 || !!produto) &&
    (!closerTrocado || closerJust.trim().length >= CLOSER_JUST_MIN);

  const fetchWebhookMeta = async () => {
    const { data: agData } = await supabase
      .from("agendamentos")
      .select("lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by")
      .eq("id", agendamentoId)
      .maybeSingle();
    let closerName: string | null = null;
    let sdrName: string | null = null;
    if (agData?.closer_id) {
      const { data: c } = await supabase.from("closers").select("name").eq("id", agData.closer_id).maybeSingle();
      closerName = c?.name ?? null;
    }
    const sdrLookup = agData?.sdr_responsavel_id ?? agData?.created_by;
    if (sdrLookup) {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", sdrLookup).maybeSingle();
      sdrName = p?.full_name ?? null;
    }
    return { agData, closerName, sdrName };
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      // Guarda o status atual para permitir reversão caso a venda seja removida.
      const statusAntes =
        (existing as any)?.status_antes_venda ??
        (currentStatus && currentStatus !== "realizada" ? currentStatus : null);

      if (existing) {
        const { error: vendaError } = await supabase
          .from("vendas")
          .update({
            vendeu: true,
            valor: valorNum,
            valor_total_projeto: valorTotalProjeto,
            produto: produto || null,
            venda_origem: vendaOrigem,
            closed_at: brTodayYMD(),
            status_antes_venda: statusAntes,
            order_bumps: orderBumps.length ? orderBumps : null,
          } as any)
          .eq("agendamento_id", agendamentoId);
        if (vendaError) throw vendaError;
      } else {
        const { error: vendaError } = await supabase.from("vendas").insert({
          agendamento_id: agendamentoId,
          vendeu: true,
          valor: valorNum,
          valor_total_projeto: valorTotalProjeto,
          produto: produto || null,
          venda_origem: vendaOrigem,
          closed_at: brTodayYMD(),
          status_antes_venda: statusAntes,
          order_bumps: orderBumps.length ? orderBumps : null,
          created_by: user.id,
        } as any);
        if (vendaError) throw vendaError;
      }


      if (currentStatus !== "realizada") {
        const { error: agError } = await supabase
          .from("agendamentos")
          .update({ status: "realizada" })
          .eq("id", agendamentoId);
        if (agError) throw agError;
      }

      const { agData, closerName, sdrName } = await fetchWebhookMeta();
      sendVendaToDataCrazy({
        agendamento_id: agendamentoId,
        lead_name: agData?.lead_name ?? leadName,
        lead_phone: agData?.lead_phone ?? null,
        closer_name: closerName,
        sdr_name: sdrName,
        vendeu: true,
        resumo_venda: null,
        valor: valorNum,
        produto: produto || null,
        venda_origem: vendaOrigem,
        motivo_nao_fechamento: null,
        follow_up: false,
        follow_up_date: null,
        follow_up_time: null,
        observacoes: null,
        outcome: "fechou",
        status: "Vendido",
        registered_at: new Date().toISOString(),
        lead_revenue: existing?.lead_revenue ?? null,
        valor_apresentado: valorNum,
        valor_total_projeto: valorTotalProjeto,
        order_bumps: orderBumps.length ? orderBumps : null,
      } as any);

      await logAudit("venda_lancada_gestor", "venda", agendamentoId, {
        lead_name: leadName,
        valor: valorNum,
        produto: produto || null,
        venda_origem: vendaOrigem,
        status_antes_venda: statusAntes,
        order_bumps: orderBumps,
      });

      toast.success("Venda lançada!");
      onSuccess("realizada");
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao lançar venda");
    }
    setSubmitting(false);
  };

  const handleRemove = async () => {
    if (!user || !existing) return;
    setRemoving(true);
    try {
      const statusAntes = (existing as any)?.status_antes_venda as string | null;

      const { error } = await supabase
        .from("vendas")
        .update({
          vendeu: false,
          valor: null,
          valor_total_projeto: null,
          produto: null,
          venda_origem: null,
          closed_at: null,
          status_antes_venda: null,
          order_bumps: null,
        } as any)
        .eq("agendamento_id", agendamentoId);
      if (error) throw error;

      const restoredStatus = statusAntes ?? "realizada";
      if (restoredStatus !== currentStatus) {
        const { error: agError } = await supabase
          .from("agendamentos")
          .update({ status: restoredStatus as any })
          .eq("id", agendamentoId);
        if (agError) throw agError;
      }

      await logAudit("venda_removida_gestor", "venda", agendamentoId, {
        lead_name: leadName,
        status_restaurado: restoredStatus,
      });

      toast.success(
        statusAntes
          ? `Venda removida — agenda voltou para "${statusAntes}".`
          : "Venda removida.",
      );
      onSuccess(restoredStatus);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover venda");
    }
    setRemoving(false);
  };

  const busy = submitting || removing;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            {hasVenda ? "Editar venda" : "Lançar venda"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{leadName}</span> — lançamento oficial da venda.
            {currentStatus !== "realizada" && (
              <span className="mt-1 block text-xs text-muted-foreground">
                A reunião será marcada como <strong>realizada</strong> automaticamente.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {existing?.vendeu_closer === true && !hasVenda && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-muted-foreground">
              O closer indicou que houve venda nesta reunião.
            </div>
          )}

          {produtosList.length > 0 && (
            <div className="space-y-1.5">
              <Label>Produto *</Label>
              <Select value={produto} onValueChange={setProduto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {produtosList.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="gestor-valor">Valor coletado (R$) *</Label>
            <Input
              id="gestor-valor"
              inputMode="numeric"
              value={formatBRL(valor)}
              onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
              placeholder="0,00"
            />
          </div>

          <OrderBumpsField value={orderBumps} onChange={setOrderBumps} idPrefix="gestor-ob" />

          {valorValido && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
              Valor total do projeto (faturado):{" "}
              <strong className="text-primary">
                {valorTotalProjeto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </strong>
              {bumpsTotal > 0 && (
                <span className="ml-1">
                  ({valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} +{" "}
                  {bumpsTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em order bumps)
                </span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Origem da venda *</Label>
            <RadioGroup
              value={vendaOrigem ?? ""}
              onValueChange={(v) => setVendaOrigem(v as "primeira_call" | "follow_up")}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="primeira_call" id="g-origem-1call" />
                  <Label htmlFor="g-origem-1call" className="cursor-pointer font-normal">Venda na 1ª call</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="follow_up" id="g-origem-fu" />
                  <Label htmlFor="g-origem-fu" className="cursor-pointer font-normal">Venda de follow-up</Label>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {hasVenda ? (
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={busy}
              className="gap-1.5 border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover venda
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || busy || loadingExisting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {hasVenda ? "Salvar" : "Lançar venda"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
