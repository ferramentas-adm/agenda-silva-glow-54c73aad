import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Phone, Video, FileText, User, Calendar, Clock, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LigarLeadButton from "@/components/LigarLeadButton";
import LeadChamadasHistorico from "@/components/LeadChamadasHistorico";

interface Agendamento {
  id: string;
  lead_name: string;
  lead_phone: string | null;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  meet_link: string | null;
  briefing: string | null;
  closer_id: string | null;
  closer_name?: string | null;
  sdr_name?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
  reagendada: "Reagendada",
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export default function LeadDetalhesPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [items, setItems] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Agendamento | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Descobre closer_id do usuário se for closer
      let myCloserId: string | null = null;
      if (role === "closer" && user?.email) {
        const { data: c } = await supabase
          .from("closers")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();
        myCloserId = c?.id ?? null;
      }

      if (id) {
        const { data } = await supabase
          .from("agendamentos")
          .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, status, meet_link, briefing, closer_id, sdr_responsavel_id, created_by")
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle();
        if (data) {
          let closerName: string | null = null;
          let sdrName: string | null = null;
          if (data.closer_id) {
            const { data: c } = await supabase.from("closers").select("name").eq("id", data.closer_id).maybeSingle();
            closerName = c?.name ?? null;
          }
          const sdrLookup = (data as any).sdr_responsavel_id ?? (data as any).created_by;
          if (sdrLookup) {
            const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", sdrLookup).maybeSingle();
            sdrName = p?.full_name ?? null;
          }
          setDetail({ ...(data as any), closer_name: closerName, sdr_name: sdrName });
        }
      } else {
        // Lista do dia
        const today = format(new Date(), "yyyy-MM-dd");
        let q = supabase
          .from("agendamentos")
          .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, status, meet_link, briefing, closer_id")
          .is("deleted_at", null)
          .eq("scheduled_date", today)
          .order("scheduled_time");
        if (myCloserId) q = q.eq("closer_id", myCloserId);
        const { data } = await q;
        setItems((data ?? []) as Agendamento[]);
      }
      setLoading(false);
    })();
  }, [id, user?.email, role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ─── Detalhe ─────────────────────────────────
  if (id) {
    if (!detail) {
      return (
        <div className="min-h-screen bg-background p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <p className="text-muted-foreground">Agendamento não encontrado.</p>
          </div>
        </div>
      );
    }
    const phoneDigits = detail.lead_phone ? onlyDigits(detail.lead_phone) : "";
    const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
    const telLink = phoneDigits ? `tel:+${phoneDigits}` : null;

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/lead-detalhes")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar à lista
          </Button>

          <div className="rounded-xl border bg-card p-6 space-y-5 shadow-sm">
            <div className="flex items-start gap-3">
              <User className="h-6 w-6 text-primary mt-1 shrink-0" />
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{detail.lead_name}</h1>
                <p className="text-sm text-muted-foreground">Detalhes do agendamento</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {STATUS_LABEL[detail.status] ?? detail.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Data
                </p>
                <p className="font-medium">{format(new Date(detail.scheduled_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Horário
                </p>
                <p className="font-medium">{detail.scheduled_time}</p>
              </div>
              {detail.closer_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Closer</p>
                  <p className="font-medium">{detail.closer_name}</p>
                </div>
              )}
              {detail.sdr_name && (
                <div>
                  <p className="text-xs text-muted-foreground">SDR responsável</p>
                  <p className="font-medium">{detail.sdr_name}</p>
                </div>
              )}
              {detail.lead_phone && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> Telefone
                  </p>
                  <p className="font-medium">{detail.lead_phone}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {waLink && (
                <Button asChild variant="outline" className="justify-start gap-2">
                  <a href={waLink} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                    Abrir WhatsApp
                  </a>
                </Button>
              )}
              {telLink && (
                <Button asChild variant="outline" className="justify-start gap-2">
                  <a href={telLink}>
                    <Phone className="h-4 w-4" />
                    Ligar para o lead
                  </a>
                </Button>
              )}
              {detail.meet_link && (
                <Button asChild variant="outline" className="justify-start gap-2">
                  <a href={detail.meet_link} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4" />
                    Entrar na reunião (Google Meet)
                  </a>
                </Button>
              )}
            </div>

            {detail.briefing && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <FileText className="h-3.5 w-3.5" /> Briefing
                </p>
                <p className="text-sm whitespace-pre-wrap">{detail.briefing}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Lista do dia ────────────────────────────
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>

        <div>
          <h1 className="text-2xl font-bold">Reuniões de hoje</h1>
          <p className="text-sm text-muted-foreground">
            Selecione um lead para ver os detalhes (WhatsApp, briefing, Meet).
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
            Nenhuma reunião agendada para hoje.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/lead-detalhes/${m.id}`)}
                className="w-full text-left rounded-lg border bg-card p-4 hover:border-primary/60 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{m.lead_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {m.scheduled_time}
                      {m.lead_phone && <> · {m.lead_phone}</>}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {STATUS_LABEL[m.status] ?? m.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
