import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightCircle, Clock, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOverdueFollowUps, type OverdueFollowUp } from "@/hooks/useOverdueFollowUps";
import { logAudit } from "@/services/auditLog";
import { formatBRDate, brTodayYMD } from "@/lib/timezone";
import {
  TOLERANCIA_DIAS_UTEIS,
  isWeekendYMD,
  temperaturaBadgeClass,
  temperaturaLabel,
} from "@/lib/followUp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import TentativaDialog from "@/components/followup/TentativaDialog";

const deferKey = (ymd: string) => `fu-lock-defer:${ymd}`;

/**
 * Trava de tela do closer: leads com follow-up atrasado precisam de uma decisão
 * antes de o closer seguir usando o sistema. Só aparece de segunda a sexta.
 */
export default function FollowUpLockOverlay() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { items, count, refetch } = useOverdueFollowUps();
  const [deferred, setDeferred] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [agora, setAgora] = useState<OverdueFollowUp | null>(null);

  const today = useMemo(() => {
    try {
      return brTodayYMD();
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    if (!today) return;
    try {
      setDeferred(localStorage.getItem(deferKey(today)) === "1");
    } catch {
      setDeferred(false);
    }
  }, [today]);

  const fimDeSemana = today ? isWeekendYMD(today) : false;
  const visivel = role === "closer" && count > 0 && !deferred && !fimDeSemana;

  const fazerDepois = () => {
    try {
      localStorage.setItem(deferKey(today), "1");
    } catch {
      /* ignore */
    }
    setDeferred(true);
  };

  const enviarParaBalde = async (item: OverdueFollowUp) => {
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from("vendas")
        .update({
          follow_up_status: "balde",
          follow_up_balde_em: new Date().toISOString(),
          follow_up_owner_closer_id: null,
        } as any)
        .eq("id", item.id);
      if (error) throw error;

      await logAudit("follow_up_lead_para_balde", "venda", item.agendamento_id, {
        lead_name: item.lead_name,
        origem: "trava_de_tela",
        dias_uteis_atraso: item.dias_uteis_atraso,
      });

      toast.success(`${item.lead_name} foi para o Balde de Reativação`);
      await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      await queryClient.invalidateQueries({ queryKey: ["balde-leads"] });
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível enviar o lead para o balde");
    }
    setBusyId(null);
  };

  return (
    <>
      {visivel && !agora && (
        <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-sm overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8">
            <div className="rounded-xl border border-amber-500/40 bg-card shadow-lg">
              <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
                <div>
                  <h2 className="text-lg font-semibold">
                    {count === 1
                      ? "Você tem 1 follow-up para regularizar"
                      : `Você tem ${count} follow-ups para regularizar`}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Escolha o que fazer com cada lead para continuar usando o sistema.
                  </p>
                </div>
              </div>

              <div className="space-y-3 p-5">
                {items.map((item) => {
                  const restantes = TOLERANCIA_DIAS_UTEIS - item.dias_uteis_atraso;
                  const ultimoDia = restantes <= 0;
                  return (
                    <div key={item.id} className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.lead_name || "Lead"}</span>
                        {item.lead_phone && (
                          <a
                            href={`tel:${item.lead_phone}`}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          >
                            <Phone className="h-3 w-3" />
                            {item.lead_phone}
                          </a>
                        )}
                        {item.record.follow_up_temperatura && (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", temperaturaBadgeClass(item.record.follow_up_temperatura))}
                          >
                            {temperaturaLabel(item.record.follow_up_temperatura)}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] inline-flex items-center gap-1",
                            ultimoDia && "border-destructive/50 text-destructive",
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {ultimoDia ? "Prazo final hoje" : `${restantes} dia útil restante`}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Combinado para {formatBRDate(item.follow_up_date)}
                        {item.follow_up_time ? ` · ${item.follow_up_time}` : ""}
                        {item.record.follow_up_produto ? ` · ${item.record.follow_up_produto}` : ""}
                        {item.record.follow_up_valor != null
                          ? ` · R$ ${Number(item.record.follow_up_valor).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}`
                          : ""}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setAgora(item)} disabled={busyId === item.id}>
                          Fazer agora
                        </Button>
                        <Button size="sm" variant="outline" onClick={fazerDepois} disabled={busyId === item.id}>
                          Fazer depois
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => enviarParaBalde(item)}
                          disabled={busyId === item.id}
                        >
                          {busyId === item.id ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRightCircle className="mr-1.5 h-4 w-4" />
                          )}
                          Enviar para o balde de reativação
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {agora && (
        <TentativaDialog
          row={agora.record}
          onClose={() => setAgora(null)}
          onDone={async () => {
            await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
            refetch();
          }}
        />
      )}
    </>
  );
}
