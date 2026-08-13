import { useState, useEffect } from "react";
import { Loader2, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logAudit } from "@/services/auditLog";
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

/**
 * Modal do CLOSER — registra apenas que a call foi realizada:
 * faixa de faturamento do lead + declaração "vendeu?" (informativa).
 *
 * A venda oficial (produto, valor coletado, origem) é lançada por
 * gestor/moderador/supervisor no GestorVendaDialog. Esta declaração NÃO entra
 * em nenhuma métrica de venda.
 */
export default function VendaDialog({ open, onOpenChange, agendamentoId, leadName, onSuccess, contentClassName }: VendaDialogProps) {
  const { user } = useAuth();

  const [vendeuCloser, setVendeuCloser] = useState<"sim" | "nao" | null>(null);
  const [leadRevenue, setLeadRevenue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  // Venda já lançada pelo gestor — preservada integralmente ao salvar.
  const [existing, setExisting] = useState<any | null>(null);

  const resetAllFields = () => {
    setVendeuCloser(null);
    setLeadRevenue("");
    setIsEditing(false);
    setExisting(null);
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
      }
      setLoadingExisting(false);
    })();
  }, [open, agendamentoId]);

  const canSubmit = !!vendeuCloser && !!leadRevenue;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const { error: vendaError } = await supabase.from("vendas").upsert(
        {
          agendamento_id: agendamentoId,
          // `vendeu` é gravado exclusivamente pelo modal do gestor — aqui só preservamos.
          vendeu: existing?.vendeu === true,
          vendeu_closer: vendeuCloser === "sim",
          lead_revenue: leadRevenue || null,
          created_by: existing?.created_by ?? user.id,
        } as any,
        { onConflict: "agendamento_id" },
      );
      if (vendaError) throw vendaError;

      const { error: agError } = await supabase
        .from("agendamentos")
        .update({ status: "realizada" })
        .eq("id", agendamentoId);
      if (agError) throw agError;

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

      sendVendaToDataCrazy({
        agendamento_id: agendamentoId,
        lead_name: agData?.lead_name ?? leadName,
        lead_phone: agData?.lead_phone ?? null,
        closer_name: closerName,
        sdr_name: sdrName,
        vendeu: false,
        resumo_venda: null,
        valor: null,
        motivo_nao_fechamento: null,
        follow_up: false,
        follow_up_date: null,
        follow_up_time: null,
        observacoes: null,
        outcome: "em_andamento",
        status: null,
        registered_at: new Date().toISOString(),
        lead_revenue: leadRevenue || null,
      } as any);

      await logAudit("call_realizada_registrada", "venda", agendamentoId, {
        lead_name: leadName,
        vendeu_closer: vendeuCloser === "sim",
        lead_revenue: leadRevenue || null,
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
