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
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { logAudit } from "@/services/auditLog";
import { DEFAULT_REASONS, isPendingStageReason } from "@/lib/vendaConstants";
import { sendVendaToDataCrazy } from "@/services/datacrazyVenda";
import { createGoogleCalendarEvent } from "@/hooks/useGoogleCalendar";

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
  const { items: produtosList } = useAppSettingList(APP_SETTING_KEYS.produtos, []);


  const [vendeu, setVendeu] = useState<"sim" | "nao" | null>(null);
  const [resumoVenda, setResumoVenda] = useState("");
  const [produto, setProduto] = useState("");
  const [valor, setValor] = useState("");
  const [valorTotalProjeto, setValorTotalProjeto] = useState("");


  // Tipo de acompanhamento quando NÃO vendeu: follow_up, segunda_reuniao ou perdeu (sem acompanhamento)
  const [acompanhamento, setAcompanhamento] = useState<"follow_up" | "segunda_reuniao" | "perdeu" | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpTime, setFollowUpTime] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [explicacaoNaoFechamento, setExplicacaoNaoFechamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [sdrError, setSdrError] = useState(false);
  const [apresentouPreco, setApresentouPreco] = useState<"sim" | "nao" | null>(null);
  const [leadRevenue, setLeadRevenue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Recebimento futuro (sinal/entrada/parcela acordada na reunião) → vai para Pagamentos
  const [hasRecebimento, setHasRecebimento] = useState(false);
  const [valorPrevisto, setValorPrevisto] = useState(""); // dígitos (centavos)
  const [dataPrevista, setDataPrevista] = useState<Date | undefined>(undefined);

  // Aviso de possível duplicata (mesmo lead + mesmo closer em ±14 dias)
  const [duplicateWarning, setDuplicateWarning] = useState<
    { date: string; vendeu: boolean; valor: number | null; segunda: boolean }[]
  >([]);

  const motivoIsPending = isPendingStageReason(motivo);

  // Venda perdida (não vendeu + sem acompanhamento) → não faz sentido registrar recebimento
  const isVendaPerdida = vendeu === "nao" && acompanhamento === "perdeu";
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
    setProduto("");
    setValor("");

    setAcompanhamento(null);
    setFollowUpDate(undefined);
    setFollowUpTime("");
    setMotivo("");
    setExplicacaoNaoFechamento("");
    setObservacoes("");
    setSdrError(false);
    setApresentouPreco(null);
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
    setDuplicateWarning([]);

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
        setProduto((data as { produto?: string | null }).produto ?? "");

        if (data.valor != null) {
          const cents = Math.round(Number(data.valor) * 100).toString();
          setValor(cents);
        }
        const reasonIsPending = isPendingStageReason(data.motivo_nao_fechamento);
        if (!data.vendeu && !reasonIsPending) {
          const segunda = (data as { segunda_reuniao?: boolean | null }).segunda_reuniao === true;
          setAcompanhamento(segunda ? "segunda_reuniao" : data.follow_up ? "follow_up" : "perdeu");
        }
        if (data.follow_up_date) {
          const [y, m, d] = data.follow_up_date.split("-").map(Number);
          setFollowUpDate(new Date(y, m - 1, d));
        }
        setFollowUpTime((data as { follow_up_time?: string | null }).follow_up_time ?? "");
        setMotivo(data.motivo_nao_fechamento ?? "");
        setExplicacaoNaoFechamento((data as { explicacao_nao_fechamento?: string | null }).explicacao_nao_fechamento ?? "");
        setObservacoes(data.observacoes ?? "");
        setSdrError(((data as { sdr_error?: boolean | null }).sdr_error) ?? false);
        if (!data.vendeu) {
          setApresentouPreco(data.valor != null && Number(data.valor) > 0 ? "sim" : "nao");
        }
        setLeadRevenue((data as { lead_revenue?: string | null }).lead_revenue ?? "");
      }
      setLoadingExisting(false);

      // Detecta possível duplicata: outras vendas do mesmo lead + closer em ±14 dias
      const { data: ag } = await supabase
        .from("agendamentos")
        .select("lead_name, closer_id, scheduled_date")
        .eq("id", agendamentoId)
        .maybeSingle();
      if (!ag) return;
      const normalize = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .split("|")[0].replace(/[^a-z0-9]+/g, " ").trim();
      const key = normalize(ag.lead_name);
      if (!key) return;
      const refDate = new Date(ag.scheduled_date + "T12:00:00").getTime();
      const lowerDate = new Date(refDate - 14 * 86400000).toISOString().slice(0, 10);
      const upperDate = new Date(refDate + 14 * 86400000).toISOString().slice(0, 10);
      let q = supabase
        .from("agendamentos")
        .select("id, lead_name, scheduled_date, closer_id, vendas!inner(id, vendeu, valor, segunda_reuniao)")
        .neq("id", agendamentoId)
        .is("deleted_at", null)
        .gte("scheduled_date", lowerDate)
        .lte("scheduled_date", upperDate);
      if (ag.closer_id) q = q.eq("closer_id", ag.closer_id);
      const { data: others } = await q;
      const matches = ((others ?? []) as any[])
        .filter((o) => normalize(o.lead_name) === key)
        .flatMap((o) =>
          (o.vendas ?? []).map((v: any) => ({
            date: o.scheduled_date,
            vendeu: !!v.vendeu,
            valor: v.valor ?? null,
            segunda: !!v.segunda_reuniao,
          })),
        );
      setDuplicateWarning(matches);
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
    if (vendeu === "sim") return valorValido && (produtosList.length === 0 || !!produto);
    if (vendeu === "nao") {
      if (!motivo) return false;
      if (explicacaoNaoFechamento.trim().length < 200) return false;
      if (apresentouPreco === null) return false;
      if (produtosList.length > 0 && !produto) return false;
      if (apresentouPreco === "sim" && !valorValido) return false;
      if (acompanhamento === null) return false;
      if ((acompanhamento === "follow_up" || acompanhamento === "segunda_reuniao") && (!followUpDate || !followUpTime)) return false;
      return true;
    }
    return false;
  })();

  const computeOutcome = (): "fechou" | "perdeu" | "follow_up" | "em_andamento" | "segunda_reuniao" => {
    if (vendeu === "sim") return "fechou";
    if (acompanhamento === "follow_up") return "follow_up";
    if (acompanhamento === "segunda_reuniao") return "segunda_reuniao";
    if (motivoIsPending) return "em_andamento";
    return "perdeu";
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const valorParsedNum = valorValido ? valorNumParsed : null;
      // valor só persiste quando vendeu OU (não vendeu e apresentou preço)
      const valorNum =
        vendeu === "sim"
          ? valorParsedNum
          : apresentouPreco === "sim"
            ? valorParsedNum
            : null;
      const fuActive = vendeu === "nao" && acompanhamento === "follow_up";
      const segundaAtiva = vendeu === "nao" && acompanhamento === "segunda_reuniao";

      const { error: vendaError } = await supabase.from("vendas").upsert(
        {
          agendamento_id: agendamentoId,
          vendeu: vendeu === "sim",
          resumo_venda: vendeu === "sim" ? resumoVenda.trim() : null,
          valor: valorNum,
          follow_up: fuActive,
          follow_up_date: fuActive && followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
          follow_up_time: fuActive && followUpTime ? followUpTime : null,
          segunda_reuniao: segundaAtiva,
          motivo_nao_fechamento: vendeu === "nao" ? motivo : null,
          explicacao_nao_fechamento: vendeu === "nao" ? explicacaoNaoFechamento.trim() : null,
          observacoes: observacoes.trim() || null,
          lead_revenue: leadRevenue || null,
          sdr_error: vendeu === "nao" ? sdrError : false,
          produto: produto || null,
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

      // Se venda ganha, remove follow-ups pendentes de OUTRAS reuniões do mesmo lead
      // (mesmo telefone normalizado) para evitar duplicidade de registro de venda.
      if (vendeu === "sim") {
        try {
          const { data: agCurr } = await supabase
            .from("agendamentos")
            .select("lead_phone")
            .eq("id", agendamentoId)
            .maybeSingle();
          const normalized = (agCurr?.lead_phone || "").replace(/\D/g, "");
          if (normalized) {
            const { data: sameLeadAgs } = await supabase
              .from("agendamentos")
              .select("id, lead_phone")
              .neq("id", agendamentoId)
              .is("deleted_at", null);
            const otherIds = (sameLeadAgs ?? [])
              .filter((a: any) => (a.lead_phone || "").replace(/\D/g, "") === normalized)
              .map((a: any) => a.id);
            if (otherIds.length > 0) {
              await supabase
                .from("vendas")
                .update({
                  follow_up: false,
                  follow_up_date: null,
                  follow_up_time: null,
                })
                .in("agendamento_id", otherIds)
                .eq("follow_up", true)
                .eq("vendeu", false);
            }
          }
        } catch (e) {
          console.warn("[vendas] falha ao limpar follow-ups do mesmo lead:", e);
        }
      }

      // Busca dados complementares para o webhook
      const { data: agData } = await supabase
        .from("agendamentos")
        .select("lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by, scheduled_date, channel_type, duration_minutes")
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

      // Cria pagamento previsto ANTES de inserir a 2ª reunião, para que o
      // trigger do webhook consiga ler o recebimento acordado ao montar o payload.
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

      // Se for "Segunda reunião", cria um novo agendamento na data/horário escolhidos
      if (segundaAtiva && followUpDate && followUpTime && agData) {
        const originLabel = agData.scheduled_date
          ? format(new Date(agData.scheduled_date + "T12:00:00"), "dd/MM/yyyy")
          : "—";
        const novaDateStr = format(followUpDate, "yyyy-MM-dd");
        const novaDuration = (agData as any).duration_minutes ?? 60;

        // Cria evento no Google Calendar do closer (Meet link + event id),
        // espelhando o fluxo do AgendarPage. Degrada com graça em caso de falha.
        let segundaMeetLink: string | null = null;
        let segundaEventId: string | null = null;
        if (agData.closer_id) {
          const gRes = await createGoogleCalendarEvent({
            closer_id: agData.closer_id,
            lead_name: agData.lead_name,
            lead_phone: agData.lead_phone,
            sdr_name: sdrName ?? (user.user_metadata?.full_name || user.email || ""),
            scheduled_date: novaDateStr,
            scheduled_time: followUpTime,
            duration_minutes: novaDuration,
          });
          if (gRes.success && gRes.meet_link) {
            segundaMeetLink = gRes.meet_link;
            segundaEventId = gRes.event_id ?? null;
          } else {
            console.warn("[segunda-reuniao] Google Calendar falhou:", gRes.error);
            toast.warning("Segunda reunião criada sem link do Google Meet.");
          }
        }

        const { error: novoAgError } = await supabase.from("agendamentos").insert({
          lead_name: agData.lead_name,
          lead_phone: agData.lead_phone,
          closer_id: agData.closer_id,
          sdr_responsavel_id: agData.sdr_responsavel_id ?? null,
          scheduled_date: novaDateStr,
          scheduled_time: followUpTime,
          duration_minutes: novaDuration,
          status: "agendada",
          channel_type: agData.channel_type ?? null,
          observation: `Segunda reunião — origem: reunião do ${originLabel}`,
          briefing: observacoes.trim() || null,
          meeting_reason: "segunda_reuniao",
          original_agendamento_id: agendamentoId,
          meet_link: segundaMeetLink,
          google_event_id: segundaEventId,
          created_by: user.id,
        } as any);
        if (novoAgError) {
          console.warn("[agendamentos] falha ao criar segunda reunião:", novoAgError);
          toast.warning("Resultado registrado, mas falhou ao criar a segunda reunião.");
        }
      }

      // Status para o CRM (DataCrazy): define em qual etapa do pipeline o card vai parar.
      // Segunda reunião não envia status novo — o webhook de agendamento já cuida do novo card.
      const crmStatus: "Follow-up" | "Perdido" | "Vendido" | null =
        vendeu === "sim"
          ? "Vendido"
          : acompanhamento === "follow_up"
            ? "Follow-up"
            : acompanhamento === "perdeu"
              ? "Perdido"
              : null;

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
        produto: produto || null,

        motivo_nao_fechamento: vendeu === "nao" ? motivo : null,
        explicacao_nao_fechamento: vendeu === "nao" ? explicacaoNaoFechamento.trim() : null,
        follow_up: fuActive,
        follow_up_date: fuActive && followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
        follow_up_time: fuActive && followUpTime ? followUpTime : null,
        segunda_reuniao: segundaAtiva,
        segunda_reuniao_date: segundaAtiva && followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
        segunda_reuniao_time: segundaAtiva && followUpTime ? followUpTime : null,
        observacoes: observacoes.trim() || null,
        outcome,
        status: crmStatus,
        registered_at: new Date().toISOString(),
        lead_revenue: leadRevenue || null,
        valor_apresentado: valorNum,
        recebimento_acordado: hasRecebimento,
        valor_previsto: hasRecebimento && valorPrevistoValido ? valorPrevistoNum : null,
        data_prevista: hasRecebimento && dataPrevista ? format(dataPrevista, "yyyy-MM-dd") : null,
      } as any);



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
            : acompanhamento === "follow_up"
              ? "Follow-up agendado"
              : acompanhamento === "segunda_reuniao"
                ? "Segunda reunião agendada"
                : "Venda perdida registrada",
      );
      onSuccess();
      // Limpa todos os campos para o próximo preenchimento
      resetAllFields();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar venda");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className={`sm:max-w-md max-h-[90vh] overflow-y-auto ${contentClassName ?? ""}`}>
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
          {duplicateWarning.filter((d) => !d.segunda).length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                ⚠️ Possível duplicata
              </p>
              <p className="text-muted-foreground">
                Já existe {duplicateWarning.length === 1 ? "uma venda registrada" : `${duplicateWarning.length} vendas registradas`} para este lead com o mesmo closer em ±14 dias:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {duplicateWarning.filter((d) => !d.segunda).map((d, i) => (
                  <li key={i}>
                    Reunião {format(new Date(d.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    {" — "}
                    {d.vendeu
                      ? `vendeu${d.valor ? ` (R$ ${Number(d.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})` : ""}`
                      : "não fechou"}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Se for o mesmo negócio, considere usar <strong>Segunda reunião</strong> em vez de registrar nova venda.
              </p>
            </div>
          )}

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
              {produtosList.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Produto vendido *</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Edite a lista de produtos em Configurações.
                  </p>
                </div>
              )}
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
                <Label htmlFor="explicacao-nao-fechou">Explicação do porque não fechou. * <span className="text-xs text-muted-foreground">(mínimo 200 caracteres)</span></Label>
                <Textarea
                  id="explicacao-nao-fechou"
                  value={explicacaoNaoFechamento}
                  onChange={(e) => setExplicacaoNaoFechamento(e.target.value)}
                  placeholder="Detalhe o motivo do lead não ter fechado. Seja específico: objeções, contexto do lead, o que tentou contornar, próximos passos sugeridos..."
                  rows={5}
                />
                <div className={`text-xs text-right ${explicacaoNaoFechamento.trim().length < 200 ? "text-rose-500" : "text-emerald-600"}`}>
                  {explicacaoNaoFechamento.trim().length}/200
                </div>
              </div>

              <div className="space-y-2">
                <Label>Apresentou o preço? *</Label>
                <RadioGroup
                  value={apresentouPreco ?? ""}
                  onValueChange={(v) => {
                    const next = v as "sim" | "nao";
                    setApresentouPreco(next);
                    if (next === "nao") setValor("");
                  }}
                >
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="sim" id="apr-preco-sim" />
                      <Label htmlFor="apr-preco-sim" className="cursor-pointer font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="nao" id="apr-preco-nao" />
                      <Label htmlFor="apr-preco-nao" className="cursor-pointer font-normal">Não</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {produtosList.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Produto ofertado *</Label>
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

              {apresentouPreco === "sim" && (
                <div className="space-y-1.5">
                  <Label htmlFor="valor-apresentado">Valor apresentado ao cliente *</Label>
                  <Input
                    id="valor-apresentado"
                    inputMode="numeric"
                    value={formatBRL(valor)}
                    onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                    placeholder="0,00"
                  />
                </div>
              )}

              <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
                <Checkbox
                  id="sdr-error"
                  checked={sdrError}
                  onCheckedChange={(v) => setSdrError(v === true)}
                />
                <div className="space-y-1 leading-none">
                  <Label htmlFor="sdr-error" className="cursor-pointer font-medium">
                    Houve erro de SDR
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Marque se o lead não foi qualificado corretamente pelo SDR (entra em "Erros SDR" para revisão).
                  </p>
                </div>
              </div>

              <>


                  <div className="space-y-2">
                    <Label>Vai acompanhar esse lead? *</Label>
                    <RadioGroup
                      value={acompanhamento ?? ""}
                      onValueChange={(v) => setAcompanhamento(v as "follow_up" | "segunda_reuniao" | "perdeu")}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="follow_up" id="ac-fu" />
                          <Label htmlFor="ac-fu" className="cursor-pointer font-normal">
                            Sim — agendar follow-up{" "}
                            <span className="text-muted-foreground">(não agenda reunião)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="segunda_reuniao" id="ac-2nd" />
                          <Label htmlFor="ac-2nd" className="cursor-pointer font-normal">Sim — marcar segunda reunião</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="perdeu" id="ac-perdeu" />
                          <Label htmlFor="ac-perdeu" className="cursor-pointer font-normal">Não (venda perdida)</Label>
                        </div>
                      </div>
                    </RadioGroup>
                    {acompanhamento === "segunda_reuniao" && (
                      <p className="text-xs text-muted-foreground">
                        Uma nova reunião será criada na agenda do mesmo closer. Não conta como follow-up.
                      </p>
                    )}
                  </div>

                  {(acompanhamento === "follow_up" || acompanhamento === "segunda_reuniao") && (
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

            </>
          )}

          {vendeu === "nao" && acompanhamento && acompanhamento !== "perdeu" && (
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
