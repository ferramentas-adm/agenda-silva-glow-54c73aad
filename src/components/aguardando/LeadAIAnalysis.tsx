import { useState } from "react";
import { Sparkles, Loader2, ThumbsUp, AlertTriangle, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Analysis {
  score: number;
  qualidade: "alta" | "media" | "baixa";
  justificativa: string;
  pontos_fortes: string[];
  pontos_atencao: string[];
  closer_sugerido: { id: string; nome: string; motivo: string } | null;
}

interface Props {
  agendamentoId: string;
  onSugerirCloser?: (closerId: string) => void;
}

export default function LeadAIAnalysis({ agendamentoId, onSugerirCloser }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Analysis | null>(null);

  const analisar = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("analisar-lead-ia", {
        body: { agendamento_id: agendamentoId },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as Analysis);
    } catch (e: any) {
      toast.error(e.message || "Falha ao analisar lead.");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <Button variant="outline" size="sm" onClick={analisar} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
        {loading ? "Analisando…" : "Analisar com IA"}
      </Button>
    );
  }

  const cor = data.qualidade === "alta" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : data.qualidade === "media" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";

  return (
    <div className="rounded-md border bg-secondary/30 p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${cor}`}>
            <Sparkles className="h-3 w-3" /> Nota IA: {data.score}/100 · {data.qualidade.toUpperCase()}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={analisar} disabled={loading} className="h-7">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reanalisar"}
        </Button>
      </div>
      <p className="text-foreground/90 whitespace-pre-wrap">{data.justificativa}</p>
      {data.pontos_fortes?.length > 0 && (
        <div className="flex items-start gap-1 text-emerald-700 dark:text-emerald-300">
          <ThumbsUp className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{data.pontos_fortes.join(" · ")}</span>
        </div>
      )}
      {data.pontos_atencao?.length > 0 && (
        <div className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{data.pontos_atencao.join(" · ")}</span>
        </div>
      )}
      {data.closer_sugerido && (
        <div className="flex items-start justify-between gap-2 rounded bg-primary/10 border border-primary/20 p-2">
          <div className="flex items-start gap-1">
            <UserCheck className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <div>
              <div className="font-semibold text-foreground">Sugestão: {data.closer_sugerido.nome}</div>
              <div className="text-muted-foreground">{data.closer_sugerido.motivo}</div>
            </div>
          </div>
          {onSugerirCloser && (
            <Button size="sm" variant="secondary" className="h-7"
              onClick={() => onSugerirCloser(data.closer_sugerido!.id)}>
              Usar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
