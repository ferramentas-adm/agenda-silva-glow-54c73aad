import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarPlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface NovoAgendamentoLead {
  lead_name: string;
  lead_phone?: string | null;
  lead_email?: string | null;
  closer_id?: string | null;
  channel_type?: string | null;
  meeting_reason?: string | null;
}

interface Props {
  lead: NovoAgendamentoLead | null;
  onOpenChange: (open: boolean) => void;
}

/** Monta a URL de /agendar com os dados do lead já preenchidos. */
export function buildAgendarUrl(lead: NovoAgendamentoLead): string {
  const params = new URLSearchParams();
  params.set("lead_name", lead.lead_name);
  if (lead.lead_phone) params.set("lead_phone", lead.lead_phone);
  if (lead.lead_email) params.set("lead_email", lead.lead_email);
  if (lead.closer_id) params.set("closer", lead.closer_id);
  if (lead.channel_type) params.set("channel", lead.channel_type);
  if (lead.meeting_reason) params.set("meeting_reason", lead.meeting_reason);
  return `/agendar?${params.toString()}`;
}

/**
 * Pop-up exibido após marcar "Não compareceu", oferecendo criar uma NOVA
 * reunião para o mesmo lead com os dados já carregados.
 */
export default function NovoAgendamentoPromptDialog({ lead, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { role } = useAuth();
  if (role === "closer") return null;

  return (
    <AlertDialog open={!!lead} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Agendar novamente?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Deseja criar uma nova reunião para <strong>{lead?.lead_name}</strong>? Os dados do lead
            serão carregados automaticamente — basta escolher o dia e o horário.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Não, agora não</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (lead) navigate(buildAgendarUrl(lead));
            }}
          >
            Sim, agendar novamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
