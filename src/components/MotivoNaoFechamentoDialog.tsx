import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  agendamentoId: string | null;
  leadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <section>
    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</h4>
    <p className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3">
      {value?.trim() || <span className="text-muted-foreground italic">Não informado.</span>}
    </p>
  </section>
);

/** Visualização somente leitura do desfecho de não fechamento preenchido pelo closer. */
export default function MotivoNaoFechamentoDialog({ agendamentoId, leadName, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["motivo-nao-fechamento", agendamentoId],
    enabled: open && !!agendamentoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("vendas")
        .select("*")
        .eq("agendamento_id", agendamentoId!)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  const fuData = data?.follow_up_date
    ? data.follow_up_date.split("-").reverse().join("/")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Motivo de não fechamento{leadName ? ` — ${leadName}` : ""}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !data || (!data.motivo_nao_fechamento && !data.observacoes && !data.explicacao_nao_fechamento) ? (
          <p className="text-sm text-muted-foreground italic">O closer ainda não preencheu o desfecho desta reunião.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Motivo" value={data.motivo_nao_fechamento} />
            <Field label="Justificativa do closer" value={data.observacoes || data.explicacao_nao_fechamento} />
            {data.explicacao_nao_fechamento && data.observacoes && (
              <Field label="Por que não fechou" value={data.explicacao_nao_fechamento} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Faturamento" value={data.lead_revenue} />
              <Field label="Nicho" value={data.nicho} />
            </div>
            <Field label="Subnicho da mentoria" value={data.subnicho} />
            <Field
              label="Follow-up"
              value={
                data.follow_up
                  ? [
                      fuData && `Data: ${fuData}${data.follow_up_time ? ` às ${String(data.follow_up_time).slice(0, 5)}` : ""}`,
                      data.follow_up_canal && `Canal: ${data.follow_up_canal}`,
                      data.follow_up_temperatura && `Temperatura: ${data.follow_up_temperatura}`,
                      data.follow_up_produto && `Produto: ${data.follow_up_produto}`,
                      data.follow_up_condicoes && `Condições: ${data.follow_up_condicoes}`,
                    ].filter(Boolean).join("\n")
                  : "Sem follow-up agendado."
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
