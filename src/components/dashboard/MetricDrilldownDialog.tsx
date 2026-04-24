import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Phone, User, Clock } from "lucide-react";

interface AgendamentoRef {
  id: string;
}

interface MetricDrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  agendamentoIds: string[];
}

interface AgendamentoDetail {
  id: string;
  lead_name: string;
  lead_phone: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  channel_type: string | null;
  meeting_reason: string | null;
  closer_id: string | null;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
  pendente: "Pendente",
  nao_confirmada: "Não confirmada",
};

const STATUS_COLOR: Record<string, string> = {
  confirmada: "bg-primary/20 text-primary",
  realizada: "bg-emerald-500/20 text-emerald-500",
  cancelada: "bg-destructive/20 text-destructive",
  no_show: "bg-orange-500/20 text-orange-500",
  reagendada: "bg-blue-500/20 text-blue-500",
};

export default function MetricDrilldownDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  agendamentoIds,
}: MetricDrilldownDialogProps) {
  const { data: details = [], isLoading } = useQuery<AgendamentoDetail[]>({
    queryKey: ["metric-drilldown", agendamentoIds.join(",")],
    enabled: open && agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select(
          "id, lead_name, lead_phone, scheduled_date, scheduled_time, status, channel_type, meeting_reason, closer_id, created_by, sdr_responsavel_id, created_at",
        )
        .in("id", agendamentoIds)
        .order("scheduled_time", { ascending: true });
      return (data ?? []) as AgendamentoDetail[];
    },
  });

  const closerIds = Array.from(new Set(details.map((d) => d.closer_id).filter(Boolean) as string[]));
  const sdrIds = Array.from(
    new Set(details.flatMap((d) => [d.sdr_responsavel_id, d.created_by].filter(Boolean) as string[])),
  );

  const { data: closers = [] } = useQuery({
    queryKey: ["drilldown-closers", closerIds.join(",")],
    enabled: open && closerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").in("id", closerIds);
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["drilldown-profiles", sdrIds.join(",")],
    enabled: open && sdrIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_profiles");
      return data ?? [];
    },
  });

  const { data: vendas = [] } = useQuery({
    queryKey: ["drilldown-vendas", agendamentoIds.join(",")],
    enabled: open && agendamentoIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("agendamento_id, observacoes, resumo_venda, motivo_nao_fechamento")
        .in("agendamento_id", agendamentoIds);
      return data ?? [];
    },
  });

  const closerMap = new Map(closers.map((c: any) => [c.id, c.name]));
  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.full_name]));
  const vendaMap = new Map(vendas.map((v: any) => [v.agendamento_id, v]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : details.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center italic">
            Nenhum agendamento corresponde a este card.
          </p>
        ) : (
          <div className="space-y-2">
            {details.map((d) => {
              const sdrId = d.sdr_responsavel_id || d.created_by;
              const sdrName = sdrId ? profileMap.get(sdrId) || "—" : "—";
              const closerName = d.closer_id ? closerMap.get(d.closer_id) || "—" : "—";
              return (
                <div key={d.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold truncate">{d.lead_name}</span>
                    </div>
                    <Badge className={STATUS_COLOR[d.status] || "bg-muted"}>
                      {STATUS_LABEL[d.status] || d.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      <span>
                        {format(new Date(d.scheduled_date + "T12:00:00"), "dd/MM", { locale: ptBR })} às{" "}
                        {d.scheduled_time}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      <span className="truncate">{d.lead_phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-foreground/70">Closer:</span>
                      <span className="truncate">{closerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-foreground/70">SDR:</span>
                      <span className="truncate">{sdrName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <CalendarDays className="h-3 w-3" />
                      <span>
                        Agendado em{" "}
                        {format(new Date(d.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {(d.channel_type || d.meeting_reason) && (
                      <div className="col-span-2 flex flex-wrap gap-1.5 pt-1">
                        {d.channel_type && (
                          <Badge variant="secondary" className="text-[10px]">
                            Canal: {d.channel_type}
                          </Badge>
                        )}
                        {d.meeting_reason && (
                          <Badge variant="outline" className="text-[10px]">
                            Motivo: {d.meeting_reason}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
