import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditLog";
import { formatBRDate } from "@/lib/timezone";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AgendamentoData {
  id: string;
  lead_name: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  closer_id: string | null;
}

export default function CancelarReuniaoPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ag, setAg] = useState<AgendamentoData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, lead_name, scheduled_date, scheduled_time, status, closer_id")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Reunião não encontrada.");
        navigate(-1);
        return;
      }
      setAg(data as AgendamentoData);
      setFetching(false);
    })();
  }, [id, navigate]);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) { setError("Informe o motivo do cancelamento."); return; }
    if (trimmed.length > 200) { setError("Máximo 200 caracteres."); return; }
    if (!ag) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ status: "cancelada", cancellation_reason: trimmed } as any)
        .eq("id", ag.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para cancelar este agendamento.");
      // Auditoria registrada automaticamente pelo trigger log_agendamento_change.
      toast.success("Reunião cancelada.");
      await queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
      await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
      navigate("/");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao cancelar reunião");
      setLoading(false);
    }
  };

  const leadName = ag?.lead_name ?? params.get("lead") ?? "";

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Cancelar reunião
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetching ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p><strong>{leadName}</strong></p>
                  {ag && (
                    <p className="text-muted-foreground text-xs mt-1">
                      {formatBRDate(ag.scheduled_date + "T12:00:00")} às {ag.scheduled_time}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Motivo do cancelamento *</Label>
                  <Input
                    id="reason"
                    autoFocus
                    maxLength={200}
                    placeholder="Ex.: Cliente desistiu, sem interesse..."
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <p className="text-[11px] text-muted-foreground">Descreva em uma linha. Obrigatório.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => navigate(-1)} disabled={loading}>Voltar</Button>
                  <Button variant="destructive" onClick={handleSubmit} disabled={loading || !reason.trim()}>
                    {loading ? "Cancelando..." : "Confirmar cancelamento"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
