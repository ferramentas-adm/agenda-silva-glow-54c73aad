import { useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  agendamentoId?: string | null;
  leadName?: string | null;
  leadPhone: string;
  onCallStarted?: () => void;
}

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

export default function LigarLeadButton({ agendamentoId, leadName, leadPhone, onCallStarted }: Props) {
  const [loading, setLoading] = useState(false);

  const phone = onlyDigits(leadPhone);
  if (!phone) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("api4com-call", {
        body: { agendamento_id: agendamentoId ?? null, lead_name: leadName ?? null, lead_phone: leadPhone },
      });

      if (error) {
        // Erros com fallback: abre o discador local (extensão instalada na máquina).
        toast.error("Não foi possível discar pela API4COM. Abrindo o discador local.");
        window.location.href = `tel:+${phone}`;
        return;
      }

      if ((data as any)?.success) {
        toast.success("Ligação solicitada — atenda no seu ramal para conectar ao lead.");
        onCallStarted?.();
      } else {
        toast.error((data as any)?.message ?? "Falha ao iniciar a ligação.");
        window.location.href = `tel:+${phone}`;
      }
    } catch (e) {
      toast.error("Erro ao iniciar a ligação. Abrindo o discador local.");
      window.location.href = `tel:+${phone}`;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" className="justify-start gap-2" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4 text-primary" />}
      {loading ? "Chamando…" : "Ligar para o lead (API4COM)"}
    </Button>
  );
}
