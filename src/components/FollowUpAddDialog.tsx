import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Search, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS } from "@/lib/vendaConstants";
import { logAudit } from "@/services/auditLog";

interface AgendamentoLite {
  id: string;
  lead_name: string;
  lead_phone: string;
  scheduled_date: string;
  scheduled_time: string | null;
  closer_id: string | null;
  closers: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: () => void;
}

export default function FollowUpAddDialog({ open, onOpenChange, onCreated }: Props) {
  const { user, role } = useAuth();
  const isCloser = role === "closer";
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AgendamentoLite | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(startOfToday());
  const [followUpTime, setFollowUpTime] = useState("");
  const [motivo, setMotivo] = useState<string>("none");
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { items: motivosList } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );

  // closer_id do usuário (se for closer)
  const { data: myCloserId } = useQuery({
    queryKey: ["my-closer-id-followup-add", user?.email],
    enabled: open && isCloser && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers").select("id").eq("email", user!.email!).maybeSingle();
      return data?.id ?? null;
    },
  });

  // Busca agendamentos por nome/telefone (mais recente por lead)
  const { data: agendamentos = [], isFetching } = useQuery({
    queryKey: ["followup-add-search", query, isCloser, myCloserId],
    enabled: open && query.trim().length >= 2 && (!isCloser || !!myCloserId),
    queryFn: async () => {
      const q = query.trim();
      let req = supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, closer_id, closers ( name )")
        .is("deleted_at", null)
        .or(`lead_name.ilike.%${q}%,lead_phone.ilike.%${q}%`)
        .order("scheduled_date", { ascending: false })
        .order("scheduled_time", { ascending: false, nullsFirst: false })
        .limit(50);
      if (isCloser && myCloserId) req = req.eq("closer_id", myCloserId);
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as unknown as AgendamentoLite[];
    },
  });

  // Agrupa por lead (telefone) — mantém o agendamento mais recente
  const uniqueLeads = useMemo(() => {
    const map = new Map<string, AgendamentoLite>();
    for (const a of agendamentos) {
      const key = (a.lead_phone || a.lead_name).trim().toLowerCase();
      if (!map.has(key)) map.set(key, a);
    }
    return Array.from(map.values());
  }, [agendamentos]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
      setFollowUpDate(startOfToday());
      setFollowUpTime("");
      setMotivo("none");
      setObservacoes("");
    }
  }, [open]);

  const canSubmit = !!selected && !!followUpDate && !submitting;

  const handleSubmit = async () => {
    if (!selected || !followUpDate || !user) return;
    setSubmitting(true);
    try {
      // Cada agendamento só pode ter um registro de resultado: se já existe
      // (ex.: closer marcou "não vendeu" sem follow-up), reaproveita esse registro.
      const { data: existing } = await supabase
        .from("vendas")
        .select("id, vendeu")
        .eq("agendamento_id", selected.id)
        .maybeSingle();

      if (existing?.vendeu) {
        toast.error("Esta reunião já tem venda registrada — não é possível abrir follow-up.");
        return;
      }

      if (existing) {
        const { error: upErr } = await supabase
          .from("vendas")
          .update({
            follow_up: true,
            follow_up_status: "ativo",
            follow_up_date: format(followUpDate, "yyyy-MM-dd"),
            follow_up_time: followUpTime || null,
            motivo_nao_fechamento: motivo === "none" ? null : motivo,
            observacoes: observacoes.trim() || null,
          } as any)
          .eq("id", existing.id);
        if (upErr) throw upErr;
        await logAudit("follow_up_atualizado", "venda", existing.id, {
          lead_name: selected.lead_name,
        });
        toast.success("Follow-up atualizado.");
      } else {
        const { data, error } = await supabase
          .from("vendas")
          .insert({
            agendamento_id: selected.id,
            vendeu: false,
            follow_up: true,
            follow_up_status: "ativo",
            follow_up_date: format(followUpDate, "yyyy-MM-dd"),
            follow_up_time: followUpTime || null,
            motivo_nao_fechamento: motivo === "none" ? null : motivo,
            observacoes: observacoes.trim() || null,
            created_by: user.id,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        await logAudit("follow_up_criado", "venda", data.id, {
          lead_name: selected.lead_name,
        });
        toast.success("Follow-up criado.");
      }

      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar follow-up.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Follow-Up</DialogTitle>
          <DialogDescription>
            Busque um lead já existente e crie um novo follow-up para acompanhamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!selected ? (
            <div className="space-y-2">
              <Label>Buscar lead *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Nome ou telefone (mín. 2 caracteres)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border border-input bg-popover">
                {query.trim().length < 2 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    Digite ao menos 2 caracteres para buscar.
                  </p>
                ) : isFetching ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : uniqueLeads.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                    Nenhum lead encontrado.
                  </p>
                ) : (
                  uniqueLeads.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className="flex w-full items-start gap-2 border-b border-input/30 px-3 py-2 text-left last:border-b-0 hover:bg-secondary/60"
                    >
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.lead_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.lead_phone || "Sem telefone"}
                          {a.closers?.name && ` · Closer: ${a.closers.name}`}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Última agenda: {a.scheduled_date ? format(new Date(`${a.scheduled_date}T00:00:00`), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          {a.scheduled_time ? ` · ${a.scheduled_time}` : ""}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selected.lead_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selected.lead_phone || "Sem telefone"}
                  {selected.closers?.name && ` · Closer: ${selected.closers.name}`}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
                title="Trocar lead"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {selected && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Data do follow-up *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !followUpDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {followUpDate
                          ? format(followUpDate, "dd/MM/yyyy", { locale: ptBR })
                          : "Selecionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={followUpDate}
                        onSelect={setFollowUpDate}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fu-time">Horário</Label>
                  <Input
                    id="fu-time"
                    type="time"
                    value={followUpTime}
                    onChange={(e) => setFollowUpTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Motivo do não fechamento</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem motivo —</SelectItem>
                    {motivosList.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fu-obs">Observações</Label>
                <Textarea
                  id="fu-obs"
                  rows={3}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Detalhes do acompanhamento..."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
