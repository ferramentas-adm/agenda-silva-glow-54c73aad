import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioTower, RefreshCw, ExternalLink, Copy, Check, MessageCircle, Search, CalendarIcon } from "lucide-react";
import { brTodayYMD, brNowHour, brNowMinute } from "@/lib/timezone";
import { cn } from "@/lib/utils";

type Presenca = "ambos" | "lead" | "closer" | "nenhum" | "ambiguo" | "desconhecido";

/** Leitura da sala + auditoria já gravada no histórico da reunião. */
type PresencaItem = {
  presenca: Presenca;
  participantes: string[];
  motivo?: string;
  tempoJuntosMinutos?: number;
  primeiraDeteccaoAt?: string;
  presencaAuditada?: boolean;
};

/** "18 min" / "1h 05min" — tempo em que lead e closer ficaram juntos na sala. */
function formatDuracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}min`;
}

/** Hora local (São Paulo) de um instante gravado pela Torre. */
function horaBR(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const PRESENCA: Record<Presenca, { label: string; dot: string; order: number }> = {
  ambiguo: { label: "Não consigo identificar quem está na sala", dot: "bg-yellow-400", order: 0 },
  lead: { label: "Só o lead na sala", dot: "bg-orange-500", order: 1 },
  nenhum: { label: "Ninguém na sala", dot: "bg-red-500", order: 2 },
  closer: { label: "Só o closer na sala", dot: "bg-sky-500", order: 3 },
  ambos: { label: "Lead e closer na sala", dot: "bg-emerald-500", order: 4 },
  desconhecido: { label: "Sem leitura do Meet", dot: "bg-muted-foreground/40", order: 5 },
};

const MOTIVO: Record<string, string> = {
  sem_link: "reunião sem link",
  sem_closer: "sem closer",
  sem_google: "closer sem Google conectado",
  google_403: "Google não liberou a leitura desta sala",
  google_401: "conexão Google expirada",
  homonimo: "o nome na sala é igual ao do lead e ao de alguém da equipe",
};

/** Hora-alvo: a partir de HH:55 mostra a próxima hora; senão, a hora corrente. */
function horaAlvo() {
  const h = brNowHour();
  return brNowMinute() >= 55 ? (h + 1) % 24 : h;
}

/** Exibe o telefone como +55 (11) 91234-5678 quando possível. */
function formatPhone(phone: string) {
  const d = phone.startsWith("55") && phone.length >= 12 ? phone.slice(2) : phone;
  if (d.length === 11) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+55 ${d}`;
}

/** Minúsculas, sem acentos — para comparar nomes digitados com nomes salvos. */
function normalize(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** "2026-09-29" -> Date local (sem deslocamento de fuso). */
function ymdParaDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Date -> "2026-09-29". */
function dateParaYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "29/09/2026" para exibição. */
function ymdBR(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Instância do módulo de conversas do DataCrazy. */
const DATACRAZY_INSTANCE = "6aaed957bfce5b063bb12a80";

/** Link direto para a conversa do lead no DataCrazy. Com conversationId abre a conversa exata; sem ele, cai na busca pelo telefone com DDI. */
function crmConversaUrl(phone: string, conversationId?: string | null) {
  const d = phone.replace(/\D/g, "");
  const comDdi = d.startsWith("55") ? d : `55${d}`;
  const base = `https://crm.datacrazy.io/multiservice?search=${comDdi}&instances=${DATACRAZY_INSTANCE}`;
  return conversationId ? `${base}&conversationId=${conversationId}` : base;
}

type ReuniaoRow = {
  id: string;
  lead_name: string;
  lead_phone: string | null;
  scheduled_time: string;
  status: string;
  meet_link: string | null;
  closer_id: string | null;
  closers: { id: string; name: string; em_treinamento: boolean } | null;
  torre_presenca_confirmada: boolean | null;
  torre_primeira_deteccao_at: string | null;
  torre_tempo_juntos_minutos: number | null;
};

const TORRE_SELECT =
  "id, lead_name, lead_phone, scheduled_time, status, meet_link, closer_id, closers(id, name, em_treinamento), torre_presenca_confirmada, torre_primeira_deteccao_at, torre_tempo_juntos_minutos";

type TurmaFiltro = "todos" | "a" | "b";

/** O termo casa com o nome do lead, o nome do closer ou o telefone (3+ dígitos)? */
function casaTermo(r: ReuniaoRow, termo: string) {
  const nome = normalize(r.lead_name ?? "");
  const closer = normalize(r.closers?.name ?? "");
  const fone = (r.lead_phone ?? "").replace(/\D/g, "");
  const qDigits = termo.replace(/\D/g, "");
  return (
    nome.includes(termo) ||
    closer.includes(termo) ||
    (qDigits.length >= 3 && fone.includes(qDigits))
  );
}

export default function TorreControleDialog() {
  const [open, setOpen] = useState(false);
  const [hora, setHora] = useState<number>(horaAlvo());
  const [copiado, setCopiado] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaDia, setBuscaDia] = useState(false);
  const [turma, setTurma] = useState<TurmaFiltro>("todos");
  const hojeYMD = brTodayYMD();
  const [dia, setDia] = useState<string>(hojeYMD);
  const hoje = dia;
  const ehHoje = dia === hojeYMD;
  const hh = String(hora).padStart(2, "0");

  const termo = normalize(busca);
  const buscando = termo.length >= 2;
  const buscaExpandida = buscando && buscaDia;

  const { data: reunioesHora = [], isLoading } = useQuery({
    queryKey: ["torre-controle", hoje, hora],
    enabled: open,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(TORRE_SELECT)
        .is("deleted_at", null)
        .eq("scheduled_date", hoje)
        .gte("scheduled_time", `${hh}:00`)
        .lte("scheduled_time", `${hh}:59`)
        .not("status", "in", "(cancelada,reagendada,no_show)")
        .order("scheduled_time");
      if (error) throw error;
      return (data ?? []) as unknown as ReuniaoRow[];
    },
  });

  /** Busca ampliada (ativa no botão "Ampliar para o dia inteiro"): cobre todas as horas. */
  const { data: resultadoBusca = [], isLoading: isLoadingBusca } = useQuery({
    queryKey: ["torre-busca", hoje, termo],
    enabled: open && buscaExpandida,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(TORRE_SELECT)
        .is("deleted_at", null)
        .eq("scheduled_date", hoje)
        .not("status", "in", "(cancelada,reagendada,no_show)")
        .order("scheduled_time");
      if (error) throw error;
      return ((data ?? []) as unknown as ReuniaoRow[]).filter((r) => casaTermo(r, termo));
    },
  });

  const reunioes = useMemo(() => {
    if (!buscando) return reunioesHora;
    if (buscaExpandida) return resultadoBusca;
    return reunioesHora.filter((r) => casaTermo(r, termo));
  }, [buscando, buscaExpandida, reunioesHora, resultadoBusca, termo]);
  const carregandoLista = buscaExpandida ? isLoadingBusca : isLoading;

  const reunioesFiltradas = useMemo(() => {
    if (turma === "todos") return reunioes;
    return reunioes.filter((r) => {
      if (!r.closers) return false;
      return turma === "b" ? r.closers.em_treinamento : !r.closers.em_treinamento;
    });
  }, [reunioes, turma]);

  const ids = reunioesFiltradas.map((r) => r.id);
  const { data: presenca = {}, isFetching, refetch } = useQuery({
    queryKey: ["torre-presenca", ids.join(",")],
    enabled: open && ids.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meet-presenca", { body: { ids } });
      if (error) throw error;
      return (data?.items ?? {}) as Record<string, PresencaItem>;
    },
  });

  const phones = reunioesFiltradas.map((r) => (r.lead_phone ?? "").replace(/\D/g, "")).filter(Boolean);
  const { data: crm = {} } = useQuery({
    queryKey: ["torre-crm", phones.join(",")],
    enabled: open && phones.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("datacrazy-conversas", { body: { phones } });
      if (error) throw error;
      return (data?.items ?? {}) as Record<string, { conversationId: string | null; aguardando: boolean; ultimaMsgLead: string | null }>;
    },
  });

  const linhas = useMemo(() => {
    return reunioesFiltradas
      .map((r) => ({
        ...r,
        p: presenca[r.id] ?? {
          presenca: "desconhecido" as Presenca,
          participantes: [],
          presencaAuditada: !!r.torre_presenca_confirmada,
          tempoJuntosMinutos: r.torre_tempo_juntos_minutos ?? undefined,
          primeiraDeteccaoAt: r.torre_primeira_deteccao_at ?? undefined,
        },
      }))
      .sort((a, b) => PRESENCA[a.p.presenca].order - PRESENCA[b.p.presenca].order || a.scheduled_time.localeCompare(b.scheduled_time));
  }, [reunioes, presenca]);

  const contagem = useMemo(() => {
    const c: Record<Presenca, number> = { ambos: 0, lead: 0, closer: 0, nenhum: 0, ambiguo: 0, desconhecido: 0 };
    linhas.forEach((l) => c[l.p.presenca]++);
    return c;
  }, [linhas]);

  const voltarAoHorario = () => {
    setBusca("");
    setBuscaDia(false);
  };

  const abrirHoraDaReuniao = (scheduledTime: string) => {
    const h = parseInt(scheduledTime.slice(0, 2), 10);
    if (!Number.isNaN(h)) setHora(h);
    setBusca("");
    setBuscaDia(false);
  };

  const renderLinha = (l: (typeof linhas)[number], mostrarAcaoHora: boolean) => {
    const cfg = PRESENCA[l.p.presenca];
    const phone = (l.lead_phone ?? "").replace(/\D/g, "");
    return (
      <div key={l.id} className="flex flex-wrap items-center gap-3 p-3">
        <span className={cn("h-3.5 w-3.5 rounded-full shrink-0", cfg.dot)} title={cfg.label} />
        <span className="font-mono text-sm w-12">{l.scheduled_time}</span>
        <div className="flex-1 min-w-[180px]">
          <p className="font-medium text-sm">{l.lead_name}</p>
          <p className="text-xs text-muted-foreground">
            Closer: {l.closers?.name ?? "—"} · {cfg.label}
            {l.p.presenca === "ambos" && typeof l.p.tempoJuntosMinutos === "number"
              ? ` (juntos há ${formatDuracao(l.p.tempoJuntosMinutos)})`
              : ""}
            {l.p.motivo ? ` (${MOTIVO[l.p.motivo] ?? l.p.motivo})` : ""}
          </p>
          {l.p.participantes.length > 0 && (
            <p className="text-xs text-muted-foreground">Na sala: {l.p.participantes.join(", ")}</p>
          )}
          {l.p.presencaAuditada && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              ✓ Validado pela Torre: a reunião aconteceu
              {l.p.primeiraDeteccaoAt ? ` (desde ${horaBR(l.p.primeiraDeteccaoAt)}` : ""}
              {l.p.primeiraDeteccaoAt && typeof l.p.tempoJuntosMinutos === "number"
                ? `, ${formatDuracao(l.p.tempoJuntosMinutos)} juntos)`
                : l.p.primeiraDeteccaoAt
                  ? ")"
                  : ""}
            </p>
          )}
        </div>
        {l.status === "em_call" && <Badge variant="outline">Em call</Badge>}
        {mostrarAcaoHora && (
          <Button size="sm" variant="ghost" onClick={() => abrirHoraDaReuniao(l.scheduled_time)} title="Ver a hora desta reunião">
            {l.scheduled_time.slice(0, 2)}h
          </Button>
        )}
        {phone && (
          <button
            type="button"
            title="Clique para copiar o telefone do lead"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-mono hover:bg-accent transition-colors"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(phone);
              } catch {
                /* fallback abaixo */
              }
              setCopiado(l.id);
              setTimeout(() => setCopiado((c) => (c === l.id ? null : c)), 1500);
            }}
          >
            {copiado === l.id ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {formatPhone(phone)}
          </button>
        )}
        {phone && (
          <Button asChild size="sm" variant="secondary" className="gap-1 relative">
            <a
              href={crmConversaUrl(phone, crm[phone]?.conversationId)}
              target="_blank"
              rel="noreferrer"
              title={crm[phone]?.aguardando ? "O lead mandou mensagem e ainda não foi respondido" : "Abrir a conversa do lead no DataCrazy"}
            >
              <MessageCircle className="h-4 w-4" /> Abrir no CRM
              {crm[phone]?.aguardando && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">!</span>
                </span>
              )}
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
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setHora(horaAlvo()); setDia(hojeYMD); setBusca(""); setBuscaDia(false); setOpen(true); }}>
        <RadioTower className="h-4 w-4" /> Torre de Controle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RadioTower className="h-5 w-5 text-primary" /> Torre de Controle — {hh}h às {hh}h59
              {!ehHoje && <span className="text-sm font-normal text-muted-foreground">· {ymdBR(dia)}</span>}
            </DialogTitle>
            <DialogDescription>
              {ehHoje
                ? "Quem já está em cada sala do Meet. Atualiza sozinho a cada 30 segundos."
                : `Reuniões do dia ${ymdBR(dia)}. Use o calendário para voltar para hoje.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setHora((h) => (h + 23) % 24)}>‹ {String((hora + 23) % 24).padStart(2, "0")}h</Button>
            <Button size="sm" variant="ghost" onClick={() => setHora((h) => (h + 1) % 24)}>{String((hora + 1) % 24).padStart(2, "0")}h ›</Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={ehHoje ? "ghost" : "secondary"} className="gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {ehHoje ? "Hoje" : ymdBR(dia)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={ymdParaDate(dia)}
                  onSelect={(d) => {
                    if (!d) return;
                    setDia(dateParaYmd(d));
                    setBusca("");
                    setBuscaDia(false);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                {!ehHoje && (
                  <div className="border-t p-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => {
                        setDia(hojeYMD);
                        setHora(horaAlvo());
                        setBusca("");
                        setBuscaDia(false);
                      }}
                    >
                      Voltar para hoje
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Atualizar
            </Button>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {([
                ["todos", "Todos"],
                ["a", "Turma A"],
                ["b", "Turma B"],
              ] as const).map(([v, label]) => (
                <Button
                  key={v}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 px-2 text-xs",
                    turma === v ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground"
                  )}
                  onClick={() => setTurma(v)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-3 text-xs">
              {(Object.keys(PRESENCA) as Presenca[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", PRESENCA[k].dot)} />
                  {PRESENCA[k].label}: <b>{contagem[k]}</b>
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                if (!e.target.value.trim()) setBuscaDia(false);
              }}
              placeholder="Buscar por nome do lead, telefone ou closer — busca neste horário"
              className="h-9 pl-8 text-sm"
            />
            {buscando && (
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setBusca("");
                  setBuscaDia(false);
                }}
              >
                Limpar
              </Button>
            )}
          </div>
          {buscando && (
            <div className="flex flex-wrap items-center gap-2">
              {buscaExpandida ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Buscando em todas as reuniões de hoje ({hoje}): {linhas.length} resultado{linhas.length === 1 ? "" : "s"}.
                  </p>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={voltarAoHorario}>
                    Voltar para {hh}h
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {linhas.length} resultado{linhas.length === 1 ? "" : "s"} nas reuniões de {hh}h de hoje ({hoje}).
                  </p>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setBuscaDia(true)}>
                    <Search className="h-3.5 w-3.5" /> Ampliar para o dia inteiro
                  </Button>
                </>
              )}
            </div>
          )}

          {carregandoLista ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{buscaExpandida ? "Buscando…" : "Carregando…"}</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {buscaExpandida
                ? `Nenhuma reunião encontrada hoje para “${busca.trim()}”.`
                : buscando
                  ? `Nenhuma reunião neste horário corresponde a “${busca.trim()}”.`
                  : "Nenhuma reunião neste horário."}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {linhas.map((l) => renderLinha(l, buscaExpandida))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
