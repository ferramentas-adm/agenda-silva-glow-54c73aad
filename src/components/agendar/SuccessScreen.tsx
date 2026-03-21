import { CheckCircle2, CalendarDays, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface SuccessScreenProps {
  leadName: string;
  closerName: string;
  date: string;
  time: string;
  onReset: () => void;
}

export default function SuccessScreen({ leadName, closerName, date, time, onReset }: SuccessScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="animate-fade-in flex flex-col items-center text-center py-8 space-y-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>

      <div>
        <h2 className="text-xl font-bold">Reunião agendada com sucesso</h2>
        <p className="mt-1 text-sm text-muted-foreground">Confira o resumo abaixo.</p>
      </div>

      <div className="w-full max-w-sm card-meeting p-5 space-y-3 text-left">
        <Row label="Lead" value={leadName} />
        <Row label="Closer" value={closerName} />
        <Row label="Data" value={date} />
        <Row label="Horário" value={time} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">Link do Meet</span>
          <span className="inline-flex items-center gap-1 text-sm text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
            meet.google.com/abc-defg-hij
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Button onClick={() => navigate("/")} className="w-full gap-2">
          <CalendarDays className="h-4 w-4" />
          Ver na agenda
        </Button>
        <Button variant="secondary" onClick={onReset} className="w-full">
          Agendar outro lead
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
