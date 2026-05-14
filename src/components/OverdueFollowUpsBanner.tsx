import { useNavigate } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOverdueFollowUps } from "@/hooks/useOverdueFollowUps";
import { Badge } from "@/components/ui/badge";

export default function OverdueFollowUpsBanner() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { count } = useOverdueFollowUps();

  if (role !== "closer" || count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/follow-ups")}
      className="w-full flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left hover:bg-amber-500/15 transition-colors"
    >
      <CalendarClock className="h-5 w-5 shrink-0 text-amber-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-500">
          Você tem {count} follow-up{count === 1 ? "" : "s"} atrasado{count === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-muted-foreground">
          Clique para resolver agora.
        </p>
      </div>
      <Badge className="shrink-0 text-base px-3 py-1 bg-amber-500 text-white hover:bg-amber-500">
        {count}
      </Badge>
    </button>
  );
}
