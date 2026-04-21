import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isToday, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, CheckCircle2, XCircle, RotateCw, Phone, Loader2, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS, isPendingStageReason } from "@/lib/vendaConstants";
import { sendVendaToDataCrazy } from "@/services/datacrazyVenda";
import { logAudit } from "@/services/auditLog";

interface FollowUpRow {
  id: string;
  agendamento_id: string;
  follow_up_date: string;
  follow_up_time: string | null;
  motivo_nao_fechamento: string | null;
  observacoes: string | null;
  valor: number | null;
  agendamentos: {
    lead_name: string;
    lead_phone: string;
    closer_id: string | null;
    closers: { name: string } | null;
  } | null;
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

export default function FollowUpsPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isCloser = role === "closer";
  const isManager = role === "gestor" || role === "moderador";

  // Descobre o closer_id do usuário (se for closer)
  const { data: myCloserId } = useQuery({
    queryKey: ["my-closer-id", user?.email],
    enabled: isCloser && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id").eq("email", user!.email!).maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data: followUps = [], isLoading, refetch } = useQuery({
    queryKey: ["follow-ups", myCloserId, isManager],
    enabled: isManager || !!myCloserId,
    queryFn: async () => {
      let query = supabase
        .from("vendas")
        .select(`
          id, agendamento_id, follow_up_date, follow_up_time,
          motivo_nao_fechamento, observacoes, valor,
          agendamentos!inner ( lead_name, lead_phone, closer_id, closers ( name ) )
        `)
        .eq("follow_up", true)
        .eq("vendeu", false)
        .order("follow_up_date", { ascending: true })
        .order("follow_up_time", { ascending: true, nullsFirst: false });

      if (isCloser && myCloserId) {
        query = query.eq("agendamentos.closer_id", myCloserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRow[];
    },
  });

  const today = startOfToday();
  const grouped = useMemo(() => {
    const overdue: FollowUpRow[] = [];
    const todayList: FollowUpRow[] = [];
    const upcoming: FollowUpRow[] = [];
    for (const f of followUps) {
      const d = parseISO(f.follow_up_date);
      if (isToday(d)) todayList.push(f);
      else if (isBefore(d, today)) overdue.push(f);
      else upcoming.push(f);
    }
    return { overdue, todayList, upcoming };
  }, [followUps, today]);

  const [actionTarget, setActionTarget] = useState<FollowUpRow | null>(null);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-primary" />
              Meus Follow-ups
            </h1>
            <p className="text-sm text-muted-foreground">
              Organize seus retornos com leads que ainda não fecharam.
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : followUps.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum follow-up agendado no momento.
            </CardContent>
          </Card>
        ) : (
          <>
            <FollowUpSection
              title="Atrasados"
              variant="overdue"
              items={grouped.overdue}
              onAction={setActionTarget}
            />
            <FollowUpSection
              title="Hoje"
              variant="today"
              items={grouped.todayList}
              onAction={setActionTarget}
            />
            <FollowUpSection
              title="Próximos"
              variant="upcoming"
              items={grouped.upcoming}
              onAction={setActionTarget}
            />
          </>
        )}

        {actionTarget && (
          <FollowUpActionDialog
            row={actionTarget}
            onClose={() => setActionTarget(null)}
            onDone={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

/* ----------------------------- Section ----------------------------- */
function FollowUpSection({
  title,
  variant,
  items,
  onAction,
}: {
  title: string;
  variant: "overdue" | "today" | "upcoming";
  items: FollowUpRow[];
  onAction: (r: FollowUpRow) => void;
}) {
  if (items.length === 0) return null;
  const badgeClass =
    variant === "overdue"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : variant === "today"
        ? "bg-primary/15 text-primary border-primary/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline" className={badgeClass}>
          {items.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((f) => (
          <FollowUpItem key={f.id} row={f} onAction={onAction} />
        ))}
      </CardContent>
    </Card>
  );
}

function FollowUpItem({ row, onAction }: { row: FollowUpRow; onAction: (r: FollowUpRow) => void }) {
  const date = parseISO(row.follow_up_date);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{row.agendamentos?.lead_name ?? "Lead"}</span>
          {row.agendamentos?.lead_phone && (
            <a
              href={`tel:${row.agendamentos.lead_phone}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Phone className="h-3 w-3" />
              {row.agendamentos.lead_phone}
            </a>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {format(date, "EEEE, dd/MM/yyyy", { locale: ptBR })}
          {row.follow_up_time && ` · ${row.follow_up_time}`}
          {row.motivo_nao_fechamento && ` · ${row.motivo_nao_fechamento}`}
        </div>
        {row.observacoes && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.observacoes}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={() => onAction(row)}>
          Próximo passo
        </Button>
      </div>
    </div>
  );
}

/* ------------------------- Action Dialog ------------------------- */
function FollowUpActionDialog({
  row,
  onClose,
  onDone,
}: {
  row: FollowUpRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { items: motivosNaoFechamento } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );

  const [outcome, setOutcome] = useState<"fechou" | "perdeu" | "reagendar" | null>(null);
  const [valor, setValor] = useState("");
  const [resumoVenda, setResumoVenda] = useState("");
  const [motivo, setMotivo] = useState(row.motivo_nao_fechamento ?? "");
  const [novaData, setNovaData] = useState<Date | undefined>(undefined);
  const [novoHorario, setNovoHorario] = useState("");
  const [observacoes, setObservacoes] = useState(row.observacoes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const motivoIsPending = isPendingStageReason(motivo);

  useEffect(() => {
    setOutcome(null);
    setValor("");
    setResumoVenda("");
    setMotivo(row.motivo_nao_fechamento ?? "");
    setNovaData(undefined);
    setNovoHorario("");
    setObservacoes(row.observacoes ?? "");
  }, [row]);

  const valorNum = digitsToNumber(valor);
  const valorValido = !isNaN(valorNum) && valorNum > 0;

  const canSubmit = (() => {
    if (!outcome) return false;
    if (outcome === "fechou") return resumoVenda.trim().length > 0 && valorValido;
    if (outcome === "perdeu") return !!motivo;
    if (outcome === "reagendar") return !!novaData && !!novoHorario;
    return false;
  })();

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      let updatePayload: Record<string, unknown>;
      let outcomeType: "fechou" | "perdeu" | "follow_up" | "em_andamento" = "perdeu";

      if (outcome === "fechou") {
        outcomeType = "fechou";
        updatePayload = {
          vendeu: true,
          resumo_venda: resumoVenda.trim(),
          valor: valorNum,
          follow_up: false,
          follow_up_date: null,
          follow_up_time: null,
          motivo_nao_fechamento: null,
          observacoes: observacoes.trim() || null,
        };
      } else if (outcome === "perdeu") {
        outcomeType = motivoIsPending ? "em_andamento" : "perdeu";
        updatePayload = {
          vendeu: false,
          resumo_venda: null,
          follow_up: false,
          follow_up_date: null,
          follow_up_time: null,
          motivo_nao_fechamento: motivo,
          observacoes: observacoes.trim() || null,
        };
      } else {
        outcomeType = "follow_up";
        updatePayload = {
          vendeu: false,
          follow_up: true,
          follow_up_date: format(novaData!, "yyyy-MM-dd"),
          follow_up_time: novoHorario,
          motivo_nao_fechamento: motivo || row.motivo_nao_fechamento,
          observacoes: observacoes.trim() || null,
        };
      }

      const { error } = await supabase.from("vendas").update(updatePayload).eq("id", row.id);
      if (error) throw error;

      // Webhook DataCrazy
      const { data: agData } = await supabase
        .from("agendamentos")
        .select("lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by")
        .eq("id", row.agendamento_id)
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
        agendamento_id: row.agendamento_id,
        lead_name: agData?.lead_name ?? row.agendamentos?.lead_name ?? "",
        lead_phone: agData?.lead_phone ?? row.agendamentos?.lead_phone ?? null,
        closer_name: closerName,
        sdr_name: sdrName,
        vendeu: outcome === "fechou",
        resumo_venda: outcome === "fechou" ? resumoVenda.trim() : null,
        valor: outcome === "fechou" ? valorNum : null,
        motivo_nao_fechamento: outcome !== "fechou" ? (motivo || row.motivo_nao_fechamento) : null,
        follow_up: outcome === "reagendar",
        follow_up_date: outcome === "reagendar" && novaData ? format(novaData, "yyyy-MM-dd") : null,
        follow_up_time: outcome === "reagendar" ? novoHorario : null,
        observacoes: observacoes.trim() || null,
        outcome: outcomeType,
        registered_at: new Date().toISOString(),
      });

      await logAudit("follow_up_atualizado", "venda", row.agendamento_id, {
        lead_name: row.agendamentos?.lead_name,
        outcome: outcomeType,
        valor: outcome === "fechou" ? valorNum : null,
        motivo: outcome !== "fechou" ? motivo : null,
      });

      toast.success(
        outcome === "fechou" ? "Venda fechada!" :
          outcome === "perdeu" ? "Lead marcado como perdido" :
            "Follow-up reagendado",
      );
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar próximo passo");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !submitting && !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Próximo passo do follow-up</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{row.agendamentos?.lead_name}</span> — registre o desfecho deste contato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={outcome === "fechou" ? "default" : "outline"}
              onClick={() => setOutcome("fechou")}
              className="flex-col h-auto py-3 gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Fechou</span>
            </Button>
            <Button
              type="button"
              variant={outcome === "perdeu" ? "default" : "outline"}
              onClick={() => setOutcome("perdeu")}
              className="flex-col h-auto py-3 gap-1"
            >
              <XCircle className="h-4 w-4" />
              <span className="text-xs">Perdeu</span>
            </Button>
            <Button
              type="button"
              variant={outcome === "reagendar" ? "default" : "outline"}
              onClick={() => setOutcome("reagendar")}
              className="flex-col h-auto py-3 gap-1"
            >
              <RotateCw className="h-4 w-4" />
              <span className="text-xs">Reagendar</span>
            </Button>
          </div>

          {outcome === "fechou" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="resumo-fu">Resumo da venda *</Label>
                <Textarea
                  id="resumo-fu"
                  value={resumoVenda}
                  onChange={(e) => setResumoVenda(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valor-fu">Valor da venda *</Label>
                <Input
                  id="valor-fu"
                  inputMode="numeric"
                  value={formatBRL(valor)}
                  onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                  placeholder="0,00"
                />
              </div>
            </>
          )}

          {outcome === "perdeu" && (
            <div className="space-y-2">
              <Label>Motivo *</Label>
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
              {motivoIsPending && (
                <p className="text-xs text-muted-foreground">
                  Marcado como etapa em andamento no CRM.
                </p>
              )}
            </div>
          )}

          {outcome === "reagendar" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Nova data *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !novaData && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {novaData ? format(novaData, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={novaData}
                      onSelect={setNovaData}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="novo-horario">Horário *</Label>
                <Input
                  id="novo-horario"
                  type="time"
                  value={novoHorario}
                  onChange={(e) => setNovoHorario(e.target.value)}
                />
              </div>
            </div>
          )}

          {outcome && (
            <div className="space-y-1.5">
              <Label htmlFor="obs-fu">Observações</Label>
              <Textarea
                id="obs-fu"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
