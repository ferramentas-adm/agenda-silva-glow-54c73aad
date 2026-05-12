import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, DollarSign, CalendarIcon } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { logAudit } from "@/services/auditLog";
import { DEFAULT_REASONS, isPendingStageReason } from "@/lib/vendaConstants";
import { sendVendaToDataCrazy } from "@/services/datacrazyVenda";

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
  "Acima de 100k/mês",
  "Não tenho essa informação",
] as const;

// Formata centavos (string de dígitos) como BRL: "123456" -> "1.234,56"
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

export default function VendaDialog({ open, onOpenChange, agendamentoId, leadName, onSuccess, contentClassName }: VendaDialogProps) {
  const { user } = useAuth();
  const { items: motivosNaoFechamento } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );

  const [vendeu, setVendeu] = useState<"sim" | "nao" | null>(null);
  const [resumoVenda, setResumoVenda] = useState("");
  const [valor, setValor] = useState("");
  const [followUp, setFollowUp] = useState<"sim" | "nao" | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpTime, setFollowUpTime] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [explicacaoNaoFechamento, setExplicacaoNaoFechamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [leadRevenue, setLeadRevenue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Recebimento futuro (sinal/entrada/parcela acordada na reunião) → vai para Pagamentos
  const [hasRecebimento, setHasRecebimento] = useState(false);
  const [valorPrevisto, setValorPrevisto] = useState(""); // dígitos (centavos)
  const [dataPrevista, setDataPrevista] = useState<Date | undefined>(undefined);

  const motivoIsPending = isPendingStageReason(motivo);

  // Venda perdida (não vendeu + sem follow-up) → não faz sentido registrar recebimento
  const isVendaPerdida = vendeu === "nao" && followUp === "nao";
  useEffect(() => {
    if (isVendaPerdida) {
      setHasRecebimento(false);
      setValorPrevisto("");
      setDataPrevista(undefined);
    }
  }, [isVendaPerdida]);

  // Helper para limpar TODOS os campos — usado em todas as transições para
  // garantir que dados de leads anteriores nunca apareçam por engano.
  const resetAllFields = () => {
    setVendeu(null);
    setResumoVenda("");
    setValor("");
    setFollowUp(null);
    setFollowUpDate(undefined);
    setFollowUpTime("");
    setMotivo("");
    setExplicacaoNaoFechamento("");
    setObservacoes("");
    setLeadRevenue("");
    setIsEditing(false);
    setHasRecebimento(false);
    setValorPrevisto("");
    setDataPrevista(undefined);
  };

  // Sempre que o dialog FECHA, limpa tudo (defesa em profundidade contra vazamento de estado)
  useEffect(() => {
    if (!open) resetAllFields();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Limpa antes de qualquer fetch para evitar flash com dados antigos
    resetAllFields();

    (async () => {
      setLoadingExisting(true);
      const { data, error } = await supabase
        .from("vendas")
        .select("*")
        .eq("agendamento_id", agendamentoId)
        .maybeSingle();
      if (!error && data) {
        setIsEditing(true);
        setVendeu(data.vendeu ? "sim" : "nao");
        setResumoVenda(data.resumo_venda ?? "");
        if (data.valor != null) {
          const cents = Math.round(Number(data.valor) * 100).toString();
          setValor(cents);
        }
        const reasonIsPending = isPendingStageReason(data.motivo_nao_fechamento);
        if (!data.vendeu && !reasonIsPending) {
          setFollowUp(data.follow_up ? "sim" : "nao");
        }
        if (data.follow_up_date) {
          const [y, m, d] = data.follow_up_date.split("-").map(Number);
          setFollowUpDate(new Date(y, m - 1, d));
        }
        setFollowUpTime((data as { follow_up_time?: string | null }).follow_up_time ?? "");
        setMotivo(data.motivo_nao_fechamento ?? "");
        setExplicacaoNaoFechamento((data as { explicacao_nao_fechamento?: string | null }).explicacao_nao_fechamento ?? "");
        setObservacoes(data.observacoes ?? "");
        setLeadRevenue((data as { lead_revenue?: string | null }).lead_revenue ?? "");
      }
      setLoadingExisting(false);
    })();
  }, [open, agendamentoId]);

  const valorNumParsed = digitsToNumber(valor);
  const valorValido = !isNaN(valorNumParsed) && valorNumParsed > 0;

  const valorPrevistoNum = digitsToNumber(valorPrevisto);
  const valorPrevistoValido = !isNaN(valorPrevistoNum) && valorPrevistoNum > 0;
  const recebimentoValido = !hasRecebimento || (valorPrevistoValido && !!dataPrevista);

  const canSubmit = (() => {
    if (!vendeu) return false;
    // Resumo/Observações é obrigatório em qualquer cenário (sim/não), independente do follow-up
    if (!observacoes.trim()) return false;
    // Faturamento do lead é obrigatório em qualquer cenário
    if (!leadRevenue) return false;
    if (!recebimentoValido) return false;
    if (vendeu === "sim") return valorValido;
    if (vendeu === "nao") {
      if (!motivo) return false;
      if (!explicacaoNaoFechamento.trim()) return false;
      if (followUp === null) return false;
      if (followUp === "sim" && (!followUpDate || !followUpTime)) return false;
      return true;
    }
    return false;
  })();

  const computeOutcome = (): "fechou" | "perdeu" | "follow_up" | "em_andamento" => {
    if (vendeu === "sim") return "fechou";
    if (followUp === "sim") return "follow_up";
    if (motivoIsPending) return "em_andamento";
    return "perdeu";
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const valorNum = valorValido ? valorNumParsed : null;
      const fuActive = vendeu === "nao" && followUp === "sim";

      const { error: vendaError } = await supabase.from("vendas").upsert(
        {
          agendamento_id: agendamentoId,
          vendeu: vendeu === "sim",
          resumo_venda: vendeu === "sim" ? resumoVenda.trim() : null,
          valor: valorNum,
          follow_up: fuActive,
          follow_up_date: fuActive && followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
          follow_up_time: fuActive && followUpTime ? followUpTime : null,
          motivo_nao_fechamento: vendeu === "nao" ? motivo : null,
          explicacao_nao_fechamento: vendeu === "nao" ? explicacaoNaoFechamento.trim() : null,
          observacoes: observacoes.trim() || null,
          lead_revenue: leadRevenue || null,
          created_by: user.id,
        } as any,
        { onConflict: "agendamento_id" },
      );
      if (vendaError) {
        if (vendaError.code === "23505") {
          toast.error("Já existe um resultado registrado para esta reunião. Atualize a página para visualizar.");
          setSubmitting(false);
          return;
        }
        throw vendaError;
      }

      const { error: agError } = await supabase
        .from("agendamentos")
        .update({ status: "realizada" })
        .eq("id", agendamentoId);
      if (agError) throw agError;

      const outcome = computeOutcome();

      // Busca dados complementares para o webhook
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

      // Dispara webhook (não bloqueante)
      sendVendaToDataCrazy({
        agendamento_id: agendamentoId,
        lead_name: agData?.lead_name ?? leadName,
        lead_phone: agData?.lead_phone ?? null,
        closer_name: closerName,
        sdr_name: sdrName,
        vendeu: vendeu === "sim",
        resumo_venda: vendeu === "sim" ? resumoVenda.trim() : null,
        valor: valorNum,
        motivo_nao_fechamento: vendeu === "nao" ? motivo : null,
        explicacao_nao_fechamento: vendeu === "nao" ? explicacaoNaoFechamento.trim() : null,
        follow_up: fuActive,
        follow_up_date: fuActive && followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
        follow_up_time: fuActive && followUpTime ? followUpTime : null,
        observacoes: observacoes.trim() || null,
        outcome,
        registered_at: new Date().toISOString(),
        lead_revenue: leadRevenue || null,
      } as any);

      // Cria pagamento previsto se foi acordado recebimento de valor durante a reunião
      if (hasRecebimento && valorPrevistoValido && dataPrevista) {
        const { error: pagError } = await supabase.from("pagamentos").insert({
          cliente_nome: agData?.lead_name ?? leadName,
          cliente_telefone: agData?.lead_phone ?? null,
          valor_previsto: valorPrevistoNum,
          data_prevista: format(dataPrevista, "yyyy-MM-dd"),
          status: "pendente",
          closer_id: agData?.closer_id ?? null,
          agendamento_id: agendamentoId,
          observacoes: observacoes.trim() || null,
          created_by: user.id,
        });
        if (pagError) {
          console.warn("[pagamentos] falha ao criar pagamento previsto:", pagError);
          toast.warning("Venda registrada, mas falhou ao criar pagamento previsto.");
        }
      }

      await logAudit("venda_registrada", "venda", agendamentoId, {
        lead_name: leadName,
        vendeu: vendeu === "sim",
        valor: valorNum,
        motivo: vendeu === "nao" ? motivo : null,
        follow_up: fuActive,
        outcome,
      });

      toast.success(
        vendeu === "sim"
          ? "Venda registrada!"
          : motivoIsPending
            ? "Resultado registrado (em andamento no CRM)"
            : followUp === "sim"
              ? "Follow-up agendado"
              : "Venda perdida registrada",
      );
      onSuccess();
      // Limpa todos os campos para o próximo preenchimento
      resetAllFields();
      onOpenChange(false);

      if (vendeu === "sim") {
        window.location.href = "https://sistema.ogruposilva.com.br/vendas";
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar venda");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            {isEditing ? "Editar Resultado da Reunião" : "Resultado da Reunião"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{leadName}</span> — registre o desfecho desta reunião.
            {isEditing && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Atualizando registro existente.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <Label>Vendeu? *</Label>
            <RadioGroup value={vendeu ?? ""} onValueChange={(v) => setVendeu(v as "sim" | "nao")}>
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
          </div>

          {vendeu === "sim" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="valor">Valor coletado no ato *</Label>
                <Input
                  id="valor"
                  inputMode="numeric"
                  value={formatBRL(valor)}
                  onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                  placeholder="0,00"
                />
              </div>
            </>
          )}

          {vendeu === "nao" && (
            <>
              <div className="space-y-2">
                <Label>Motivo de não fechamento *</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {motivosNaoFechamento.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="explicacao-nao-fechou">Explicação do porque não fechou. *</Label>
                <Textarea
                  id="explicacao-nao-fechou"
                  value={explicacaoNaoFechamento}
                  onChange={(e) => setExplicacaoNaoFechamento(e.target.value)}
                  placeholder="Detalhe o motivo do lead não ter fechado..."
                  rows={3}
                />
              </div>

              <>

                  <div className="space-y-2">
                    <Label>Vai acompanhar esse lead? *</Label>
                    <RadioGroup value={followUp ?? ""} onValueChange={(v) => setFollowUp(v as "sim" | "nao")}>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="sim" id="fu-sim" />
                          <Label htmlFor="fu-sim" className="cursor-pointer font-normal">Sim</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="nao" id="fu-nao" />
                          <Label htmlFor="fu-nao" className="cursor-pointer font-normal">Não (venda perdida)</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>

                  {followUp === "sim" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label>Data *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !followUpDate && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {followUpDate ? format(followUpDate, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={followUpDate}
                              onSelect={setFollowUpDate}
                              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                              locale={ptBR}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="fu-time">Horário *</Label>
                        <Input
                          id="fu-time"
                          type="time"
                          value={followUpTime}
                          onChange={(e) => setFollowUpTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </>

              <div className="space-y-1.5">
                <Label htmlFor="valor-apresentado">Valor apresentado ao cliente (opcional)</Label>
                <Input
                  id="valor-apresentado"
                  inputMode="numeric"
                  value={formatBRL(valor)}
                  onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">
                  Preencha caso o valor tenha sido apresentado durante a reunião.
                </p>
              </div>
            </>
          )}

          {vendeu === "nao" && followUp !== "nao" && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-2">
                <Label>Foi acordado recebimento de valor (sinal/entrada/restante)?</Label>
                <RadioGroup
                  value={hasRecebimento ? "sim" : "nao"}
                  onValueChange={(v) => setHasRecebimento(v === "sim")}
                >
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="sim" id="receb-sim" />
                      <Label htmlFor="receb-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="nao" id="receb-nao" />
                      <Label htmlFor="receb-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  Se sim, será criado um pagamento previsto na aba Pagamentos.
                </p>
              </div>

              {hasRecebimento && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="valor-previsto">Valor previsto *</Label>
                    <Input
                      id="valor-previsto"
                      inputMode="numeric"
                      value={formatBRL(valorPrevisto)}
                      onChange={(e) => setValorPrevisto(e.target.value.replace(/\D/g, ""))}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data prevista *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dataPrevista && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataPrevista ? format(dataPrevista, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dataPrevista}
                          onSelect={setDataPrevista}
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          locale={ptBR}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>
          )}

          {vendeu && (
            <div className="space-y-1.5">
              <Label htmlFor="obs">Descreva brevemente o que o cliente faz *</Label>
              <Textarea
                id="obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas adicionais sobre o lead/conversa..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Campo obrigatório — sempre registre um resumo da reunião, independente do follow-up.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting || loadingExisting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
