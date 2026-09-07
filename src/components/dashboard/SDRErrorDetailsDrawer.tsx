import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, User, PhoneCall, CalendarClock, FileText, Briefcase, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamentoId: string | null;
}

interface AgendamentoFull {
  id: string;
  lead_name: string;
  lead_phone: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  channel_type: string | null;
  meeting_reason: string | null;
  briefing: string | null;
  observation: string | null;
  status: string;
  closer_id: string | null;
  sdr_responsavel_id: string | null;
  created_by: string | null;
}

interface VendaFull {
  id: string;
  vendeu: boolean | null;
  valor: number | null;
  lead_revenue: string | null;
  produto: string | null;
  motivo_nao_fechamento: string | null;
  explicacao_nao_fechamento: string | null;
  resumo_venda: string | null;
  observacoes: string | null;
  follow_up: boolean | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  segunda_reuniao: boolean | null;
  closed_at: string | null;
}

const formatCurrency = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <div className="text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

export default function SDRErrorDetailsDrawer({ open, onOpenChange, agendamentoId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["sdr-error-details", agendamentoId],
    enabled: open && !!agendamentoId,
    queryFn: async () => {
      const [{ data: ag, error: e1 }, { data: vd, error: e2 }] = await Promise.all([
        supabase
          .from("agendamentos")
          .select(
            "id, lead_name, lead_phone, scheduled_date, scheduled_time, channel_type, meeting_reason, briefing, observation, status, closer_id, sdr_responsavel_id, created_by"
          )
          .eq("id", agendamentoId!)
          .maybeSingle(),
        supabase
          .from("vendas")
          .select(
            "id, vendeu, valor, lead_revenue, produto, motivo_nao_fechamento, explicacao_nao_fechamento, resumo_venda, observacoes, follow_up, follow_up_date, follow_up_time, segunda_reuniao, closed_at"
          )
          .eq("agendamento_id", agendamentoId!)
          .maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const ids = new Set<string>();
      if (ag?.sdr_responsavel_id) ids.add(ag.sdr_responsavel_id);
      if (ag?.created_by) ids.add(ag.created_by);
      let sdrName: string | null = null;
      let closerName: string | null = null;
      if (ids.size) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", Array.from(ids));
        const sdrId = ag?.sdr_responsavel_id ?? ag?.created_by ?? null;
        sdrName = profs?.find((p) => p.user_id === sdrId)?.full_name ?? null;
      }
      if (ag?.closer_id) {
        const { data: c } = await supabase
          .from("closers")
          .select("name")
          .eq("id", ag.closer_id)
          .maybeSingle();
        closerName = c?.name ?? null;
      }
      return {
        agendamento: ag as AgendamentoFull | null,
        venda: vd as VendaFull | null,
        sdrName,
        closerName,
      };
    },
  });

  const ag = data?.agendamento;
  const vd = data?.venda;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes do lead</SheetTitle>
          <SheetDescription>
            Informações preenchidas pelo SDR antes da call e pelo Closer após a call.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !ag ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Agendamento não encontrado.
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Cabeçalho do lead */}
            <section className="rounded-lg border border-primary/10 bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {ag.lead_name}
                  </p>
                  {ag.lead_phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <PhoneCall className="h-3 w-3" /> {ag.lead_phone}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="capitalize">
                  {ag.status?.replace("_", " ")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {format(new Date(ag.scheduled_date), "dd/MM/yyyy")}
                {ag.scheduled_time ? ` às ${ag.scheduled_time}` : ""}
              </div>
            </section>

            {/* SDR pré-call */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                Pré-call · preenchido pelo SDR
              </h3>
              <div className="rounded-lg border border-primary/10 bg-card p-4 grid gap-4 sm:grid-cols-2">
                <Field label="SDR responsável" value={data?.sdrName} />
                <Field label="Closer atribuído" value={data?.closerName} />
                <Field label="Origem do lead" value={ag.channel_type} />
                <Field label="Motivo da reunião" value={ag.meeting_reason} />
                <div className="sm:col-span-2">
                  <Field
                    label="Briefing"
                    value={ag.briefing ? <p className="whitespace-pre-wrap">{ag.briefing}</p> : null}
                  />
                </div>
                {ag.observation && (
                  <div className="sm:col-span-2">
                    <Field
                      label="Observações (SDR)"
                      value={<p className="whitespace-pre-wrap">{ag.observation}</p>}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Closer pós-call */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-500" />
                Pós-call · preenchido pelo Closer
              </h3>
              {!vd ? (
                <div className="rounded-lg border border-dashed border-primary/15 bg-card/50 p-4 text-sm text-muted-foreground">
                  Nenhum resultado de venda registrado para esta reunião.
                </div>
              ) : (
                <div className="rounded-lg border border-primary/10 bg-card p-4 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Vendeu?"
                    value={
                      vd.vendeu === true ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Sim</Badge>
                      ) : vd.vendeu === false ? (
                        <Badge variant="outline">Não</Badge>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Field
                    label={vd.vendeu ? "Valor da venda" : "Valor apresentado"}
                    value={
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        {formatCurrency(vd.valor)}
                      </span>
                    }
                  />
                  <Field label="Produto" value={vd.produto} />
                  <Field label="Faturamento do lead" value={vd.lead_revenue} />
                  {vd.vendeu === false && (
                    <>
                      <Field label="Motivo do não fechamento" value={vd.motivo_nao_fechamento} />
                      <div className="sm:col-span-2">
                        <Field
                          label="Explicação"
                          value={
                            vd.explicacao_nao_fechamento ? (
                              <p className="whitespace-pre-wrap">{vd.explicacao_nao_fechamento}</p>
                            ) : null
                          }
                        />
                      </div>
                    </>
                  )}
                  {vd.resumo_venda && (
                    <div className="sm:col-span-2">
                      <Field
                        label="Resumo da venda"
                        value={<p className="whitespace-pre-wrap">{vd.resumo_venda}</p>}
                      />
                    </div>
                  )}
                  {vd.follow_up && (
                    <Field
                      label="Follow-up"
                      value={
                        vd.follow_up_date
                          ? `${format(new Date(vd.follow_up_date), "dd/MM/yyyy")}${vd.follow_up_time ? ` às ${vd.follow_up_time}` : ""}`
                          : "Sim"
                      }
                    />
                  )}
                  {vd.segunda_reuniao && <Field label="Segunda reunião" value="Sim" />}
                  {vd.closed_at && (
                    <Field
                      label="Fechado em"
                      value={format(new Date(vd.closed_at), "dd/MM/yyyy")}
                    />
                  )}
                  {vd.observacoes && (
                    <div className="sm:col-span-2">
                      <Field
                        label="Observações (Closer)"
                        value={<p className="whitespace-pre-wrap">{vd.observacoes}</p>}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
