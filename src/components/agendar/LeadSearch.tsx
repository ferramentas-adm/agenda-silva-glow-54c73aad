import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, X, RefreshCw, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { buscarLeadsPorTermo } from "@/services/datacrazy";
import { DataCrazyUnavailableError } from "@/lib/retryWithBackoff";
import {
  ensureLeads,
  getSnapshot,
  subscribe,
  mergeLeads,
  type StoreLead,
} from "@/services/leadsStore";
import { cn } from "@/lib/utils";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  dataCrazyId?: string;
  meta_lead_id?: string | null;
  tags?: { id: string; name: string }[];
}

interface LeadSearchProps {
  selectedLead: Lead | null;
  onSelect: (lead: Lead) => void;
  onClear: () => void;
}

const toLead = (l: StoreLead): Lead => ({
  id: l.id,
  name: l.name,
  phone: l.phone,
  dataCrazyId: l.id,
  meta_lead_id: l.meta_lead_id,
  tags: l.tags,
});

export default function LeadSearch({ selectedLead, onSelect, onClear }: LeadSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [showManual, setShowManual] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const tagAgendamentoId = import.meta.env.VITE_DATACRAZY_TAG_AGENDAMENTO || "";

  // ── Base de leads: carrega em BACKGROUND, página por página ────────
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (tagAgendamentoId) void ensureLeads(tagAgendamentoId);
  }, [tagAgendamentoId]);

  // ── Busca rápida no CRM enquanto digita ───────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const searchEnabled = !!tagAgendamentoId && debouncedQuery.length >= 2;
  const { data: remoteResults = [], isFetching: searching, error: searchError } = useQuery<StoreLead[]>({
    queryKey: ["datacrazy-lead-search", tagAgendamentoId, debouncedQuery.toLowerCase()],
    queryFn: async () => {
      const res = await buscarLeadsPorTermo(tagAgendamentoId, debouncedQuery);
      return res.map((l) => ({
        id: l.id,
        name: l.name,
        phone:
          (l.phone as string) ||
          (Array.isArray(l.phones) && l.phones[0]?.phone ? String(l.phones[0].phone) : ""),
        meta_lead_id: l.meta_lead_id,
        tags: l.tags,
      }));
    },
    enabled: searchEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    placeholderData: (prev) => prev,
  });

  // ── Filtro local + merge com o resultado remoto ────────────────────
  const filteredLeads = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    const digits = debouncedQuery.replace(/\D/g, "");
    const local =
      q.length >= 2
        ? store.leads.filter(
            (l) =>
              l.name?.toLowerCase().includes(q) ||
              (digits.length >= 3 && l.phone?.replace(/\D/g, "").includes(digits)),
          )
        : store.leads;
    return q.length >= 2 ? mergeLeads(local, remoteResults) : local;
  }, [store.leads, debouncedQuery, remoteResults]);

  // Re-render periódico para o "Atualizado há Xs"
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const lastUpdatedLabel = (() => {
    if (!store.updatedAt) return null;
    const secs = Math.max(0, Math.floor((Date.now() - store.updatedAt) / 1000));
    if (secs < 60) return `há ${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `há ${mins} min`;
    return `há ${Math.floor(mins / 60)} h`;
  })();

  const handleRefresh = () => {
    if (tagAgendamentoId) void ensureLeads(tagAgendamentoId, true);
  };

  const handleManualSelect = () => {
    const name = manualName.trim();
    const phone = manualPhone.replace(/\D/g, "");
    if (!name || phone.length < 10 || phone.length > 13) return;
    onSelect({ id: `manual-${crypto.randomUUID()}`, name, phone });
  };

  if (selectedLead) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
        <div>
          <p className="font-medium">{selectedLead.name}</p>
          <p className="text-xs text-muted-foreground">{selectedLead.phone}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onClear} title="Limpar seleção">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  const dataCrazySlow = searchError instanceof DataCrazyUnavailableError || store.error instanceof DataCrazyUnavailableError;

  return (
    <div ref={wrapperRef} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Digite o nome ou telefone do lead..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={store.loading}
          title="Atualizar lista de leads"
        >
          <RefreshCw className={`h-4 w-4 ${store.loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {dataCrazySlow && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-foreground">DataCrazy demorou, tente de novo.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>Tentar de novo</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowManual(true)}>Digitar manualmente</Button>
          </div>
        </div>
      )}

      {(showManual || (dataCrazySlow && filteredLeads.length === 0)) && (
        <div className="grid gap-2 rounded-md border border-input p-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label="Nome do lead"
            placeholder="Nome do lead"
            value={manualName}
            onChange={(event) => setManualName(event.target.value)}
          />
          <Input
            aria-label="Telefone do lead"
            placeholder="Telefone com DDD"
            inputMode="tel"
            value={manualPhone}
            onChange={(event) => setManualPhone(event.target.value)}
          />
          <Button
            type="button"
            onClick={handleManualSelect}
            disabled={!manualName.trim() || manualPhone.replace(/\D/g, "").length < 10}
          >
            Continuar
          </Button>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-lg border border-input bg-popover">
        {filteredLeads.length === 0 ? (
          store.loading || searching ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : (
            <div className="px-4 py-3 space-y-1">
              <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
              <p className="text-xs text-muted-foreground">
                Adicionou a tag <span className="font-semibold">"agendamento"</span> agora no DataCrazy?
                Clique em <span className="font-semibold">Atualizar</span> — pode levar alguns segundos para sincronizar.
              </p>
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setShowManual(true)}>
                Digitar nome e telefone manualmente
              </Button>
            </div>
          )
        ) : (
          <>
            {filteredLeads.map((sl) => {
              const lead = toLead(sl);
              const hasPhone = !!lead.phone && lead.phone.trim().length > 0;
              return (
                <button
                  key={lead.id}
                  onClick={() => hasPhone && onSelect(lead)}
                  disabled={!hasPhone}
                  title={hasPhone ? undefined : "Lead sem telefone — cadastre no DataCrazy"}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left border-b border-input/30 last:border-b-0 transition-colors",
                    hasPhone
                      ? "hover:bg-secondary/60 cursor-pointer"
                      : "opacity-60 cursor-not-allowed"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium">{lead.name}</p>
                    {hasPhone ? (
                      <p className="text-xs text-muted-foreground">{lead.phone}</p>
                    ) : (
                      <p className="text-xs text-destructive">
                        Sem telefone no DataCrazy — cadastre o telefone do lead para conseguir agendar.
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
            {store.loading && (
              <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Carregando mais leads em segundo plano…
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center justify-between gap-2">
        <span>
          {store.total && store.total > store.leads.length
            ? `${store.leads.length} de ${store.total} leads carregados`
            : `${store.leads.length} lead${store.leads.length !== 1 ? "s" : ""} com tag "agendamento"`}
        </span>
        {lastUpdatedLabel && (
          <span className="text-[11px]">
            {store.loading ? "Atualizando…" : `Atualizado ${lastUpdatedLabel}`}
          </span>
        )}
      </p>
    </div>
  );
}
