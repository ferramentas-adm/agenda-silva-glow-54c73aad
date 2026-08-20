import { useEffect, useState } from "react";
import { PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatInSaoPaulo } from "@/lib/timezone";

interface Chamada {
  id: string;
  called_by: string;
  status: string;
  status_label: string | null;
  duration_seconds: number | null;
  started_at: string;
  caller_name?: string | null;
}

const fmtDuration = (s: number | null) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export default function LeadChamadasHistorico({ agendamentoId, refreshKey = 0 }: { agendamentoId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<Chamada[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("chamadas")
        .select("id, called_by, status, status_label, duration_seconds, started_at")
        .eq("agendamento_id", agendamentoId)
        .order("started_at", { ascending: false })
        .limit(20);

      const list = (data ?? []) as Chamada[];
      const ids = [...new Set(list.map((r) => r.called_by))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.user_id, p.full_name]));
        list.forEach((r) => (r.caller_name = map.get(r.called_by) ?? null));
      }
      setRows(list);
    })();
  }, [agendamentoId, refreshKey]);

  if (rows.length === 0) return null;

  return (
    <div className="pt-2 border-t">
      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
        <PhoneCall className="h-3.5 w-3.5" /> Ligações
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {formatInSaoPaulo(r.started_at, "dd/MM HH:mm")}
              {r.caller_name ? ` · ${r.caller_name}` : ""}
            </span>
            <span className="font-medium">
              {r.status_label ?? (r.status === "iniciada" ? "Em andamento" : r.status)}
              {" · "}
              {fmtDuration(r.duration_seconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
