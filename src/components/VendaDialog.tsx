import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, DollarSign, CalendarIcon, Lock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { logAudit } from "@/services/auditLog";
import { sendVendaToDataCrazy } from "@/services/datacrazyVenda";
import { useAppSettingList, APP_SETTING_KEYS, useProdutosAtivos } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS, NICHO_OPTIONS, NICHO_OUTRO, splitNicho } from "@/lib/vendaConstants";
import OrderBumpsField from "@/components/OrderBumpsField";
import { OrderBump, parseOrderBumpsColumn } from "@/lib/orderBumps";
import { CANAL_OPTIONS, TEMPERATURA_OPTIONS } from "@/lib/followUp";
import { pickedDateToYMD, brTodayYMD } from "@/lib/timezone";

interface VendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamentoId: string;
  leadName: string;
  onSuccess: () => void;
  contentClassName?: string;
}

const LEAD_REVENUE_OPTIONS = [
  "Abaixo de 10k/mês",
  "Entre 10k e 30k/mês",
  "Entre 30k e 50k/mês",
  "Entre 50k e 100k/mês",
  "Entre 100k e 300k/mês",
  "Entre 300k e 500k/mês",
  "Entre 500k e 1M/mês",
  "Acima de 1M/mês",
  "Não tenho essa informação",
] as const;

const CONDICOES_MIN = 30;

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
 * Modal do CLOSER — registra apenas que a call foi realizada:
 * faixa de faturamento do lead + declaração "vendeu?" (informativa) e,
 * quando não vendeu, o combinado do follow-up (canal, temperatura, produto,
 * valor ofertado, condições e data/hora).
 *
 * A venda oficial (produto, valor coletado, origem) é lançada por
 * gestor/moderador/supervisor no GestorVendaDialog.
 */
export default function VendaDialog({ open, onOpenChange, agendamentoId, leadName, onSuccess, contentClassName }: VendaDialogProps) {
  const { user, role } = useAuth();
  const isCloser = role === "closer";
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [vendeuCloser, setVendeuCloser] = useState<"sim" | "nao" | null>(null);
  const [leadRevenue, setLeadRevenue] = useState<string>("");
  const [nichoOpt, setNichoOpt] = useState<string>("");
  const [nichoOutro, setNichoOutro] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [observacoes, setObservacoes] = useState<string>("");
  const [orderBumps, setOrderBumps] = useState<OrderBump[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  // Venda já lançada pelo gestor — preservada integralmente ao salvar.
  const [existing, setExisting] = useState<any | null>(null);

  // Follow-up combinado
  const [temFollowUp, setTemFollowUp] = useState<"sim" | "nao" | null>(null);
  const [fuCanal, setFuCanal] = useState<string>("");
  const [fuTemperatura, setFuTemperatura] = useState<string>("");
  const [fuProduto, setFuProduto] = useState<string>("");
  const [fuValor, setFuValor] = useState<string>("");
  const [fuCondicoes, setFuCondicoes] = useState<string>("");
  const [fuData, setFuData] = useState<Date | undefined>(undefined);
  const [fuHora, setFuHora] = useState<string>("");

  const { items: motivosNaoFechamento } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );
  const { items: produtosList } = useProdutosAtivos();

  // Auditoria da Torre de Controle: tempo real em que lead e closer ficaram juntos.
  const [torre, setTorre] = useState<{ minutos: number | null; auditada: boolean }>({ minutos: null, auditada: false });
  useEffect(() => {
    if (!open) { setTorre({ minutos: null, auditada: false }); return; }
    (async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("torre_presenca_confirmada, torre_tempo_juntos_minutos")
        .eq("id", agendamentoId)
        .maybeSingle();
      setTorre({
        minutos: data?.torre_tempo_juntos_minutos ?? null,
        auditada: !!data?.torre_presenca_confirmada,
      });
    })();
  }, [open, agendamentoId]);

  const resetAllFields = () => {
    setVendeuCloser(null);
    setLeadRevenue("");
    setNichoOpt("");
    setNichoOutro("");
    setMotivo("");
    setObservacoes("");
    setOrderBumps([]);
    setIsEditing(false);
    setExisting(null);
    setTemFollowUp(null);
    setFuCanal("");
    setFuTemperatura("");
    setFuProduto("");
    setFuValor("");
    setFuCondicoes("");
    setFuData(undefined);
    setFuHora("");
  };

  useEffect(() => {
    if (!open) resetAllFields();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    resetAllFields();

    (async () => {
      setLoadingExisting(true);
      const { data, error } = await supabase
        .from("vendas")
        .select("*")
        .eq("agendamento_id", agendamentoId)
        .maybeSingle();
      if (!error && data) {
        setExisting(data);
        setIsEditing(true);
        const declared = (data as { vendeu_closer?: boolean | null }).vendeu_closer;
        if (declared === true) setVendeuCloser("sim");
        else if (declared === false) setVendeuCloser("nao");
        setLeadRevenue((data as { lead_revenue?: string | null }).lead_revenue ?? "");
        const n = splitNicho((data as { nicho?: string | null }).nicho);
        setNichoOpt(n.opt);
        setNichoOutro(n.outro);
        setMotivo((data as { motivo_nao_fechamento?: string | null }).motivo_nao_fechamento ?? "");
        setObservacoes((data as { observacoes?: string | null }).observacoes ?? "");
        setOrderBumps(parseOrderBumpsColumn((data as { order_bumps?: unknown }).order_bumps));
      }
      setLoadingExisting(false);
    })();
  }, [open, agendamentoId]);

  const JUSTIFICATION_MIN = 100;
  const justificationLength = observacoes.trim().length;
  const justificationOk = vendeuCloser !== "nao" || justificationLength >= JUSTIFICATION_MIN;

  const fuValorNum = digitsToNumber(fuValor);
  const fuValorOk = !isNaN(fuValorNum) && fuValorNum > 0;
  const condicoesLength = fuCondicoes.trim().length;
  const followUpOk =
    vendeuCloser !== "nao"
      ? true
      : temFollowUp === "nao"
        ? true
        : temFollowUp === "sim"
          ? !!fuCanal && !!fuTemperatura && (produtosList.length === 0 || !!fuProduto) &&
            fuValorOk && condicoesLength >= CONDICOES_MIN && !!fuData && !!fuHora
          : false;

  const nichoFinal = nichoOpt === NICHO_OUTRO ? nichoOutro.trim() : nichoOpt;
  const nichoOk = !!nichoOpt && (nichoOpt !== NICHO_OUTRO || nichoOutro.trim().length >= 2);

  const canSubmit =
    !!vendeuCloser && !!leadRevenue && nichoOk && (vendeuCloser === "sim" || !!motivo) &&
    justificationOk && followUpOk;

  const handleSubmit = async () => {
    if (!canSubmit || !user || locked) return;
    setSubmitting(true);
    try {
      const comFollowUp = vendeuCloser === "nao" && temFollowUp === "sim";
      const fuDataStr = comFollowUp && fuData ? pickedDateToYMD(fuData) : null;

      const payload = {
        vendeu_closer: vendeuCloser === "sim",
        lead_revenue: leadRevenue || null,
        nicho: nichoFinal || null,
        motivo_nao_fechamento: vendeuCloser === "nao" ? motivo || null : null,
        observacoes: observacoes.trim() || null,
        order_bumps: vendeuCloser === "sim" && orderBumps.length ? orderBumps : null,
        follow_up: comFollowUp,
        follow_up_status: comFollowUp ? "ativo" : "concluido",
        follow_up_date: fuDataStr,
        follow_up_time: comFollowUp ? fuHora : null,
        follow_up_canal: comFollowUp ? fuCanal : null,
        follow_up_temperatura: comFollowUp ? fuTemperatura : null,
        follow_up_produto: comFollowUp ? (fuProduto || null) : null,
        follow_up_valor: comFollowUp ? fuValorNum : null,
        follow_up_condicoes: comFollowUp ? fuCondicoes.trim() : null,
        follow_up_tentativas: 0,
      };

      const denyMessage =
        "Você não tem permissão para registrar o resultado desta reunião — acione o gestor.";

      const logBlocked = async (etapa: string) => {
        await logAudit("call_realizada_bloqueada", "venda", agendamentoId, {
          lead_name: leadName,
          etapa,
          user_id: user.id,
        });
      };

      let vendaId: string | null = existing?.id ?? null;

      if (existing) {
        const { data: updated, error: vendaError } = await supabase
          .from("vendas")
          .update(payload as any)
          .eq("agendamento_id", agendamentoId)
          .select("id");
        if (vendaError) throw vendaError;
        if (!updated || updated.length === 0) {
          await logBlocked("update_venda");
          throw new Error(denyMessage);
        }
        vendaId = updated[0].id;
      } else {
        const { data: inserted, error: vendaError } = await supabase
          .from("vendas")
          .insert({
            agendamento_id: agendamentoId,
            vendeu: false,
            ...payload,
            created_by: user.id,
          } as any)
          .select("id");
        if (vendaError) throw vendaError;
        vendaId = inserted?.[0]?.id ?? null;
      }

      const { data: agUpdated, error: agError } = await supabase
        .from("agendamentos")
        .update({ status: "realizada" })
        .eq("id", agendamentoId)
        .select("id");
      if (agError) throw agError;
      if (!agUpdated || agUpdated.length === 0) {
        await logBlocked("update_status");
        throw new Error(denyMessage);
      }

      // Webhook informativo de call realizada (sem alterar etapa de venda no CRM)
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

      // Follow-up fica apenas no sistema: nenhum evento é criado na agenda Google.


      sendVendaToDataCrazy({
        agendamento_id: agendamentoId,
        lead_name: agData?.lead_name ?? leadName,
        lead_phone: agData?.lead_phone ?? null,
        closer_name: closerName,
        sdr_name: sdrName,
        vendeu: false,
        resumo_venda: null,
        valor: null,
        motivo_nao_fechamento: vendeuCloser === "nao" ? motivo || null : null,
        follow_up: comFollowUp,
        follow_up_date: fuDataStr,
        follow_up_time: comFollowUp ? fuHora : null,
        observacoes: observacoes.trim() || null,
        outcome: "em_andamento",
        status: null,
        registered_at: new Date().toISOString(),
        lead_revenue: leadRevenue || null,
      } as any);

      await logAudit("call_realizada_registrada", "venda", agendamentoId, {
        lead_name: leadName,
        vendeu_closer: vendeuCloser === "sim",
        lead_revenue: leadRevenue || null,
        tera_follow_up: comFollowUp,
        follow_up_canal: comFollowUp ? fuCanal : null,
        follow_up_temperatura: comFollowUp ? fuTemperatura : null,
        follow_up_produto: comFollowUp ? fuProduto || null : null,
        follow_up_valor: comFollowUp ? fuValorNum : null,
        follow_up_date: fuDataStr,
        follow_up_time: comFollowUp ? fuHora : null,
      });

      toast.success("Reunião registrada como realizada!");
      onSuccess();
      resetAllFields();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar resultado da reunião");
    }
    setSubmitting(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className={`sm:max-w-md max-h-[90vh] overflow-y-auto ${contentClassName ?? ""}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            {locked ? "Desfecho concluído" : isEditing ? "Editar Resultado da Reunião" : "Resultado da Reunião"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{leadName}</span> — registre o desfecho desta reunião.
            {locked ? (
              <span className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-500">
                <Lock className="h-3 w-3" /> Desfecho já registrado — somente leitura. Correções devem ser solicitadas à gestão.
              </span>
            ) : isEditing && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Atualizando registro existente.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={locked} className="space-y-4 disabled:opacity-80">
          <div className="space-y-2">
            <Label>Faturamento do lead *</Label>
            <Select value={leadRevenue} onValueChange={setLeadRevenue}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o faturamento" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_REVENUE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Campo obrigatório — selecione a faixa de faturamento mensal informada pelo lead.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nicho do cliente *</Label>
            <Select value={nichoOpt} onValueChange={setNichoOpt}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o nicho" />
              </SelectTrigger>
              <SelectContent>
                {NICHO_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {nichoOpt === NICHO_OUTRO && (
              <Input
                value={nichoOutro}
                onChange={(e) => setNichoOutro(e.target.value)}
                placeholder="Escreva qual é o nicho do cliente"
                maxLength={120}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Vendeu? *</Label>
            <RadioGroup value={vendeuCloser ?? ""} onValueChange={(v) => setVendeuCloser(v as "sim" | "nao")}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="sim" id="vendeu-sim" />
                  <Label htmlFor="vendeu-sim" className="cursor-pointer font-normal">Sim</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="nao" id="vendeu-nao" />
                  <Label htmlFor="vendeu-nao" className="cursor-pointer font-normal">Não</Label>
                </div>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              O lançamento oficial da venda é feito pelo gestor/supervisor.
            </p>
          </div>

          {vendeuCloser === "sim" && (
            <OrderBumpsField value={orderBumps} onChange={setOrderBumps} idPrefix="closer-ob" />
          )}

          {vendeuCloser === "nao" && (
            <div className="space-y-2">
              <Label>Motivo de não fechamento *</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivosNaoFechamento.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {torre.auditada && typeof torre.minutos === "number" && (
                <p className="text-xs text-muted-foreground">
                  Tempo em sala registrado pela Torre de Controle: <strong>{torre.minutos} min</strong> com o lead.
                </p>
              )}
              {motivo === "Cliente precisou sair" && (torre.minutos ?? 0) > 15 && (
                <p className="text-xs font-medium text-destructive">
                  Atenção: a Torre registrou {torre.minutos} min de reunião com o lead. Esse tempo não caracteriza uma
                  saída no início da call, então este caso ficará sinalizado para a gestão auditar.
                </p>
              )}
            </div>
          )}

          {vendeuCloser === "nao" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-2">
                <Label>Vai ter follow-up com este lead? *</Label>
                <RadioGroup
                  value={temFollowUp ?? ""}
                  onValueChange={(v) => setTemFollowUp(v as "sim" | "nao")}
                >
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="sim" id="fu-sim" />
                      <Label htmlFor="fu-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="nao" id="fu-nao" />
                      <Label htmlFor="fu-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {temFollowUp === "sim" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Como será o contato? *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {CANAL_OPTIONS.map((c) => (
                        <Button
                          key={c.value}
                          type="button"
                          size="sm"
                          variant={fuCanal === c.value ? "default" : "outline"}
                          onClick={() => setFuCanal(c.value)}
                        >
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Chance de fechar *</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {TEMPERATURA_OPTIONS.map((t) => (
                        <Button
                          key={t.value}
                          type="button"
                          size="sm"
                          variant={fuTemperatura === t.value ? "default" : "outline"}
                          onClick={() => setFuTemperatura(t.value)}
                        >
                          {t.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Quanto mais quente, maior o destaque do lead na tela de follow-ups.
                    </p>
                  </div>

                  {produtosList.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Produto que será fechado *</Label>
                      <Select value={fuProduto} onValueChange={setFuProduto}>
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
                    <Label htmlFor="fu-valor">Valor ofertado e combinado *</Label>
                    <Input
                      id="fu-valor"
                      inputMode="numeric"
                      value={formatBRL(fuValor)}
                      onChange={(e) => setFuValor(e.target.value.replace(/\D/g, ""))}
                      placeholder="0,00"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fu-cond">Condições da negociação *</Label>
                    <Textarea
                      id="fu-cond"
                      value={fuCondicoes}
                      onChange={(e) => setFuCondicoes(e.target.value)}
                      rows={4}
                      placeholder="Parcelamento, desconto autorizado, prazo, objeções pendentes e o que ficou combinado."
                    />
                    <p
                      className={cn(
                        "text-xs font-medium",
                        condicoesLength >= CONDICOES_MIN ? "text-emerald-500" : "text-destructive",
                      )}
                    >
                      {condicoesLength}/{CONDICOES_MIN} caracteres
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Data combinada *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !fuData && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {fuData ? format(fuData, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={fuData}
                            onSelect={setFuData}
                            disabled={(d) => pickedDateToYMD(d) < brTodayYMD()}
                            locale={ptBR}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fu-hora">Horário *</Label>
                      <Input
                        id="fu-hora"
                        type="time"
                        value={fuHora}
                        onChange={(e) => setFuHora(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    O compromisso entra na sua agenda Google e você receberá avisos na tela no dia.
                    Se o contato não for registrado, o lead vai para o Balde de Reativação à 00:01.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Justificativa {vendeuCloser === "nao" && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={
                vendeuCloser === "nao"
                  ? 'Explique com detalhes por que o lead não fechou. Se possível, destaque entre aspas uma frase dita pelo cliente. Ex.: "vou esperar o próximo mês para decidir".'
                  : "Detalhes relevantes da reunião (opcional)"
              }
              rows={vendeuCloser === "nao" ? 5 : 3}
            />
            {vendeuCloser === "nao" && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Obrigatório — mínimo de {JUSTIFICATION_MIN} caracteres. Se possível, destaque entre
                  aspas alguma frase dita pelo cliente que explique por que ele não seguiu para o
                  fechamento.
                </p>
                <p
                  className={`text-xs font-medium ${
                    justificationLength >= JUSTIFICATION_MIN ? "text-emerald-500" : "text-destructive"
                  }`}
                >
                  {justificationLength}/{JUSTIFICATION_MIN} caracteres
                </p>
              </div>
            )}
          </div>
        </fieldset>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {locked ? "Fechar" : "Cancelar"}
          </Button>
          {!locked && (
            <Button
              onClick={() => (isCloser ? setConfirmOpen(true) : handleSubmit())}
              disabled={!canSubmit || submitting || loadingExisting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar e enviar desfecho da reunião?</AlertDialogTitle>
          <AlertDialogDescription>
            Atenção: ao confirmar, todos os dados preenchidos (faturamento, nicho, motivo,
            justificativa e follow-up) serão gravados definitivamente. Você não poderá alterar
            essas informações depois. Qualquer correção deverá ser solicitada à gestão.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Revisar dados</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setConfirmOpen(false); handleSubmit(); }}
          >
            Confirmar e salvar definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
