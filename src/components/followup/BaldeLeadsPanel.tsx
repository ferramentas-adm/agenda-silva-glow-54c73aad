import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Phone, Recycle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { logAudit } from "@/services/auditLog";
import { useMyCloserId } from "@/hooks/useMyCloserId";
import { pickedDateToYMD, brTodayYMD, formatBRDate } from "@/lib/timezone";
import { CANAL_OPTIONS, TEMPERATURA_OPTIONS, temperaturaBadgeClass, temperaturaLabel } from "@/lib/followUp";
import { FOLLOWUP_SELECT, type FollowUpRecord } from "@/components/followup/types";

/**
 * Balde de Reativação: leads que ficaram sem contato no dia combinado.
 * O lead é da empresa — qualquer closer da turma correspondente pode puxá-lo.
 * Turma A vê apenas leads qualificados; Turma B, apenas desqualificados.
 * A turma é lida em tempo real (os gestores trocam closers de turma a qualquer momento).
 */
export default function BaldeLeadsPanel() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isCloser = role === "closer";
  const isManager = role === "gestor" || role === "moderador" || role === "apresentador" || role === "supervisor";
  const { data: myCloserId } = useMyCloserId();

  const { data: myTurma } = useQuery({
    queryKey: ["balde-minha-turma", myCloserId],
    enabled: isCloser && !!myCloserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("em_treinamento")
        .eq("id", myCloserId!)
        .maybeSingle();
      return data?.em_treinamento ? "b" : "a";
    },
  });

  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ["balde-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(FOLLOWUP_SELECT)
        .eq("follow_up", true)
        .eq("vendeu", false)
        .eq("follow_up_status", "balde")
        .order("follow_up_balde_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRecord[];
    },
  });

  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<FollowUpRecord | null>(null);

  const visible = useMemo(() => {
    return leads.filter((l) => {
      if (isCloser && myTurma) {
        const desq = !!l.agendamentos?.lead_desqualificado;
        if (myTurma === "a" && desq) return false;
        if (myTurma === "b" && !desq) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const nome = (l.agendamentos?.lead_name || "").toLowerCase();
        const tel = (l.agendamentos?.lead_phone || "").toLowerCase();
        if (!nome.includes(q) && !tel.includes(q)) return false;
      }
      return true;
    });
  }, [leads, isCloser, myTurma, search]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Recycle className="h-4 w-4 text-primary" />
            Balde de reativação
            <Badge variant="outline">{visible.length}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {isCloser
              ? myTurma === "b"
                ? "Você está na Turma B: aqui aparecem apenas leads desqualificados."
                : "Você está na Turma A: aqui aparecem apenas leads qualificados."
              : "Leads que ficaram sem contato no dia combinado. Todos os closers da turma correspondente podem puxá-los."}
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Buscar por nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum lead disponível no balde.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 pt-4">
            {visible.map((l) => (
              <div
                key={l.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{l.agendamentos?.lead_name}</span>
                    {l.agendamentos?.lead_phone && (
                      <a
                        href={`tel:${l.agendamentos.lead_phone}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        <Phone className="h-3 w-3" />
                        {l.agendamentos.lead_phone}
                      </a>
                    )}
                    <Badge variant="outline" className={cn("text-[10px]", temperaturaBadgeClass(l.follow_up_temperatura))}>
                      {temperaturaLabel(l.follow_up_temperatura)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {l.agendamentos?.lead_desqualificado ? "Desqualificado" : "Qualificado"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Último closer: {l.agendamentos?.closers?.name ?? "—"}
                    {l.follow_up_balde_em && ` · liberado em ${formatBRDate(l.follow_up_balde_em)}`}
                    {` · ${l.follow_up_tentativas ?? 0} tentativa(s)`}
                  </div>
                  {l.follow_up_condicoes && (
                    <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">
                      <span className="font-semibold text-muted-foreground">Negociação: </span>
                      {l.follow_up_condicoes}
                    </p>
                  )}
                </div>
                {(isCloser || isManager) && (
                  <Button size="sm" onClick={() => setTarget(l)} disabled={isCloser && !myCloserId}>
                    Puxar lead
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {target && (
        <PuxarLeadDialog
          row={target}
          myCloserId={myCloserId ?? null}
          isManager={isManager}
          onClose={() => setTarget(null)}
          onDone={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
            queryClient.invalidateQueries({ queryKey: ["balde-leads"] });
          }}
        />
      )}
    </div>
  );
}

function PuxarLeadDialog({
  row,
  myCloserId,
  isManager,
  onClose,
  onDone,
}: {
  row: FollowUpRecord;
  myCloserId: string | null;
  isManager: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [canal, setCanal] = useState<string>(row.follow_up_canal ?? "");
  const [temperatura, setTemperatura] = useState<string>(row.follow_up_temperatura ?? "");
  const [data, setData] = useState<Date | undefined>(undefined);
  const [hora, setHora] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: closersList = [] } = useQuery({
    queryKey: ["balde-closers"],
    enabled: isManager,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });
  const [closerId, setCloserId] = useState<string>(myCloserId ?? "");

  const canSubmit = !!closerId && !!canal && !!temperatura && !!data && !!hora;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const dataStr = pickedDateToYMD(data!);

      const { data: ok, error: rpcError } = await supabase.rpc("reassign_agendamento_closer_for_result", {
        _agendamento_id: row.agendamento_id,
        _new_closer_id: closerId,
      });
      if (rpcError) throw rpcError;
      if (ok === false) throw new Error("Não foi possível transferir este lead para o closer escolhido.");

      const { data: updated, error } = await supabase
        .from("vendas")
        .update({
          follow_up: true,
          follow_up_status: "ativo",
          follow_up_date: dataStr,
          follow_up_time: hora,
          follow_up_canal: canal,
          follow_up_temperatura: temperatura,
          follow_up_tentativas: 0,
          follow_up_owner_closer_id: closerId,
          follow_up_balde_em: null,
        } as any)
        .eq("id", row.id)
        .select("id");
      if (error) throw error;
      if (!updated?.length) throw new Error("O lead não foi puxado. Tente novamente.");

      const eventId = await upsertFollowUpCalendarEvent({
        closer_id: closerId,
        lead_name: row.agendamentos?.lead_name ?? "Lead",
        lead_phone: row.agendamentos?.lead_phone,
        canal,
        data: dataStr,
        hora,
        produto: row.follow_up_produto,
        valor: row.follow_up_valor != null ? String(row.follow_up_valor) : null,
        condicoes: row.follow_up_condicoes,
        temperatura,
        tentativa: 0,
      });
      if (eventId) {
        await supabase.from("vendas").update({ follow_up_event_id: eventId } as any).eq("id", row.id);
      }

      await logAudit("follow_up_lead_puxado_do_balde", "venda", row.agendamento_id, {
        lead_name: row.agendamentos?.lead_name,
        closer_anterior: row.agendamentos?.closers?.name ?? null,
        novo_closer_id: closerId,
        canal,
        temperatura,
        nova_data: dataStr,
        nova_hora: hora,
      });

      toast.success("Lead puxado para a sua lista de follow-ups");
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao puxar o lead");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !submitting && !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Puxar lead do balde</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{row.agendamentos?.lead_name}</span> — combine o próximo contato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isManager && (
            <div className="space-y-1.5">
              <Label>Closer responsável *</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={closerId}
                onChange={(e) => setCloserId(e.target.value)}
              >
                <option value="">Selecione</option>
                {closersList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Canal combinado *</Label>
            <div className="grid grid-cols-2 gap-2">
              {CANAL_OPTIONS.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  size="sm"
                  variant={canal === c.value ? "default" : "outline"}
                  onClick={() => setCanal(c.value)}
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
                  variant={temperatura === t.value ? "default" : "outline"}
                  onClick={() => setTemperatura(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !data && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {data ? format(data, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={data}
                    onSelect={setData}
                    disabled={(d) => pickedDateToYMD(d) < brTodayYMD()}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="balde-hora">Horário *</Label>
              <Input id="balde-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Puxar lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
