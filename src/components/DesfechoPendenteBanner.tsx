import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesfechoPendente } from "@/hooks/useDesfechoPendente";

interface Props {
  onOpen: (id: string, leadName: string) => void;
}

/** Alerta do closer: reuniões realizadas aguardando o preenchimento do desfecho. */
export default function DesfechoPendenteBanner({ onOpen }: Props) {
  const { data = [] } = useDesfechoPendente();
  const [expanded, setExpanded] = useState(false);
  if (data.length === 0) return null;

  const fmt = (ymd: string) => ymd.split("-").reverse().join("/");

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-sm font-medium flex-1">
          Você tem {data.length} {data.length === 1 ? "reunião realizada hoje" : "reuniões realizadas hoje"} aguardando o
          preenchimento do desfecho (faturamento, nicho, motivo e follow-up).
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/40" onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
          {expanded ? "Ocultar" : "Ver reuniões"}
        </Button>
      </div>
      {expanded && (
        <ul className="space-y-1">
          {data.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-xs rounded-md bg-background/60 px-2 py-1.5">
              <span className="truncate">
                <strong>{m.lead_name}</strong> — {fmt(m.scheduled_date)} às {m.scheduled_time}
              </span>
              <Button size="sm" className="h-6 text-xs bg-amber-500 hover:bg-amber-600 text-amber-950" onClick={() => onOpen(m.id, m.lead_name)}>
                Completar desfecho
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
