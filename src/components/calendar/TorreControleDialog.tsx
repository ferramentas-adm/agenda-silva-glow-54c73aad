import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioTower, RefreshCw, ExternalLink, MessageCircle } from "lucide-react";
import { brTodayYMD, brNowHour, brNowMinute } from "@/lib/timezone";
import { cn } from "@/lib/utils";

type Presenca = "ambos" | "lead" | "closer" | "nenhum" | "desconhecido";

const PRESENCA: Record<Presenca, { label: string; dot: string; order: number }> = {
  lead: { label: "Só o lead na sala", dot: "bg-amber-500", order: 0 },
  nenhum: { label: "Ninguém na sala", dot: "bg-red-500", order: 1 },
  closer: { label: "Só o closer na sala", dot: "bg-sky-500", order: 2 },
  ambos: { label: "Lead e closer na sala", dot: "bg-emerald-500", order: 3 },
  desconhecido: { label: "Sem leitura do Meet", dot: "bg-muted-foreground/40", order: 4 },
};

const MOTIVO: Record<string, string> = {
  sem_link: "reunião sem link",
  sem_closer: "sem closer",
  sem_google: "closer sem Google conectado",
  google_403: "Google não liberou a leitura desta sala",
  google_401: "conexão Google expirada",
};

/** Hora-alvo: a partir de HH:55 mostra a próxima hora; senão, a hora corrente. */
function horaAlvo() {
  const h = brNowHour();
  return brNowMinute() >= 55 ? (h + 1) % 24 : h;
}

export default function TorreControleDialog() {
  const [open, setOpen] = useState(false);
  const [hora, setHora] = useState<number>(horaAlvo());
  const hoje = brTodayYMD();
  const hh = String(hora).padStart(2, "0");

  const { data: reunioes = [], isLoading } = useQuery({
    queryKey: ["torre-controle", hoje, hora],
    enabled: open,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, lead_name, lead_phone, scheduled_time, status, meet_link, closer_id, closers(name)")
        .is("deleted_at", null)
        .eq("scheduled_date", hoje)
        .gte("scheduled_time", `${hh}:00`)
        .lte("scheduled_time", `${hh}:59`)
        .not("status", "in", "(cancelada,reagendada,no_show)")
        .order("scheduled_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ids = reunioes.map((r) => r.id);
  const { data: presenca = {}, isFetching, refetch } = useQuery({
    queryKey: ["torre-presenca", ids.join(",")],
    enabled: open && ids.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meet-presenca", { body: { ids } });
      if (error) throw error;
      return (data?.items ?? {}) as Record<string, { presenca: Presenca; participantes: string[]; motivo?: string }>;
    },
  });

  const linhas = useMemo(() => {
    return reunioes
      .map((r) => ({ ...r, p: presenca[r.id] ?? { presenca: "desconhecido" as Presenca, participantes: [] } }))
      .sort((a, b) => PRESENCA[a.p.presenca].order - PRESENCA[b.p.presenca].order || a.scheduled_time.localeCompare(b.scheduled_time));
  }, [reunioes, presenca]);

  const contagem = useMemo(() => {
    const c: Record<Presenca, number> = { ambos: 0, lead: 0, closer: 0, nenhum: 0, desconhecido: 0 };
    linhas.forEach((l) => c[l.p.presenca]++);
    return c;
  }, [linhas]);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setHora(horaAlvo()); setOpen(true); }}>
        <RadioTower className="h-4 w-4" /> Torre de Controle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RadioTower className="h-5 w-5 text-primary" /> Torre de Controle — {hh}h às {hh}h59
            </DialogTitle>
            <DialogDescription>
              Quem já está em cada sala do Meet. Atualiza sozinho a cada 30 segundos.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setHora((h) => (h + 23) % 24)}>‹ {String((hora + 23) % 24).padStart(2, "0")}h</Button>
            <Button size="sm" variant="ghost" onClick={() => setHora((h) => (h + 1) % 24)}>{String((hora + 1) % 24).padStart(2, "0")}h ›</Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Atualizar
            </Button>
            <div className="ml-auto flex flex-wrap gap-3 text-xs">
              {(Object.keys(PRESENCA) as Presenca[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", PRESENCA[k].dot)} />
                  {PRESENCA[k].label}: <b>{contagem[k]}</b>
                </span>
              ))}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma reunião neste horário.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {linhas.map((l) => {
                const cfg = PRESENCA[l.p.presenca];
                const phone = (l.lead_phone ?? "").replace(/\D/g, "");
                return (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 p-3">
                    <span className={cn("h-3.5 w-3.5 rounded-full shrink-0", cfg.dot)} title={cfg.label} />
                    <span className="font-mono text-sm w-12">{l.scheduled_time}</span>
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-medium text-sm">{l.lead_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Closer: {(l as any).closers?.name ?? "—"} · {cfg.label}
                        {l.p.motivo ? ` (${MOTIVO[l.p.motivo] ?? l.p.motivo})` : ""}
                      </p>
                      {l.p.participantes.length > 0 && (
                        <p className="text-xs text-muted-foreground">Na sala: {l.p.participantes.join(", ")}</p>
                      )}
                    </div>
                    {l.status === "em_call" && <Badge variant="outline">Em call</Badge>}
                    {phone && (
                      <Button asChild size="sm" variant="ghost" className="gap-1">
                        <a href={`https://wa.me/${phone.startsWith("55") ? phone : "55" + phone}`} target="_blank" rel="noreferrer">
                          <MessageCircle className="h-4 w-4" /> WhatsApp
                        </a>
                      </Button>
                    )}
                    {l.meet_link && (
                      <Button asChild size="sm" variant="outline" className="gap-1">
                        <a href={l.meet_link} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" /> Abrir sala
                        </a>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
