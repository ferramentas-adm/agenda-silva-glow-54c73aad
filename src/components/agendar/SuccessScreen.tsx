import { useState } from "react";
import { CheckCircle2, CalendarDays, ExternalLink, Video, Copy, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface SuccessScreenProps {
  leadName: string;
  closerName: string;
  date: string;
  time: string;
  meetLink: string | null;
  meetError: boolean;
  onRetryMeet: () => Promise<void>;
  onReset: () => void;
}

export default function SuccessScreen({
  leadName, closerName, date, time, meetLink, meetError, onRetryMeet, onReset,
}: SuccessScreenProps) {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const handleCopyLink = () => {
    if (meetLink) {
      navigator.clipboard.writeText(meetLink);
      toast.success("Link copiado!");
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    await onRetryMeet();
    setRetrying(false);
  };

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

        {/* Meet link section */}
        {meetLink ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Link do Meet</span>
              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Video className="h-3.5 w-3.5" />
                Abrir Meet
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-secondary px-2 py-1.5 text-xs text-muted-foreground">
                {meetLink}
              </code>
              <Button variant="ghost" size="sm" onClick={handleCopyLink} className="h-7 w-7 p-0 shrink-0">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : meetError ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Link do Meet não gerado — tente sincronizar manualmente
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={retrying}
              className="w-full gap-2 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Gerando..." : "Tentar novamente"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {meetLink && (
          <Button
            asChild
            className="w-full gap-2"
            style={{ backgroundColor: "hsl(var(--accent-meet))", color: "hsl(0 0% 10%)" }}
          >
            <a href={meetLink} target="_blank" rel="noopener noreferrer">
              <Video className="h-4 w-4" />
              Entrar na reunião
            </a>
          </Button>
        )}
        <Button variant={meetLink ? "secondary" : "default"} onClick={() => navigate("/")} className="w-full gap-2">
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
