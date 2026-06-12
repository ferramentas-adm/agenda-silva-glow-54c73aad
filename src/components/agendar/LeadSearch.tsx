import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, X, Tag, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { buscarLeadsComTagId, type DataCrazyLead } from "@/services/datacrazy";
import { DataCrazyUnavailableError } from "@/lib/retryWithBackoff";
import { cn } from "@/lib/utils";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  dataCrazyId?: string;
  tags?: { id: string; name: string }[];
}

interface LeadSearchProps {
  selectedLead: Lead | null;
  onSelect: (lead: Lead) => void;
  onClear: () => void;
}

function mapToLead(dcLead: DataCrazyLead): Lead {
  const phone =
    dcLead.phone ||
    (dcLead.phones && dcLead.phones.length > 0 ? dcLead.phones[0].phone : "") ||
    "";
  return {
    id: dcLead.id,
    name: dcLead.name,
    phone: typeof phone === "string" ? phone : String(phone),
    dataCrazyId: dcLead.id,
    tags: dcLead.tags,
  };
}

export default function LeadSearch({ selectedLead, onSelect, onClear }: LeadSearchProps) {
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch leads with "agendamento" tag from DataCrazy
  const tagAgendamentoId = import.meta.env.VITE_DATACRAZY_TAG_AGENDAMENTO || "";

  const { data: taggedLeads = [], isLoading, error, isFetching, dataUpdatedAt } = useQuery<Lead[]>({
    queryKey: ["datacrazy-leads-agendamento", tagAgendamentoId],
    queryFn: async () => {
      const dcLeads = await buscarLeadsComTagId(tagAgendamentoId);
      return dcLeads.map(mapToLead);
    },
    enabled: !!tagAgendamentoId,
    // Sempre re-buscar ao abrir a tela / focar a aba, para que leads
    // recém-tagueados no DataCrazy apareçam imediatamente.
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  // "Atualizado há Xs" — força re-render a cada 15s
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const lastUpdatedLabel = (() => {
    if (!dataUpdatedAt) return null;
    const secs = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000));
    if (secs < 60) return `há ${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `há ${hrs} h`;
  })();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["datacrazy-leads-agendamento"] });
  };

  // Local filter
  const filteredLeads = query.length >= 2
    ? taggedLeads.filter(
        (l) =>
          l.name.toLowerCase().includes(query.toLowerCase()) ||
          l.phone.includes(query)
      )
    : taggedLeads;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        // close dropdown if open
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selectedLead) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
        <div>
          <p className="font-medium">{selectedLead.name}</p>
          <p className="text-xs text-muted-foreground">{selectedLead.phone}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors" title="Limpar seleção">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (error || taggedLeads.length === 0) {
    const isUnavailable = error instanceof DataCrazyUnavailableError;
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-card py-10 text-center">
        <Tag className="h-8 w-8 text-primary" />
        <p className="text-sm font-medium text-foreground">
          {isUnavailable
            ? "Serviço temporariamente indisponível"
            : "Nenhum lead disponível para agendamento."}
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {isUnavailable ? (
            "Não conseguimos carregar os leads do DataCrazy agora. Tente novamente em alguns instantes."
          ) : (
            <>
              Adicione a tag <span className="font-semibold text-primary">"agendamento"</span> ao lead no DataCrazy para que ele apareça aqui.
            </>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="mt-2 gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {isUnavailable ? "Tentar novamente" : "Atualizar"}
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nome ou telefone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isFetching}
          title="Atualizar lista de leads"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-input bg-popover">
        {filteredLeads.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum lead encontrado.</p>
        ) : (
          filteredLeads.map((lead) => {
            const hasPhone = !!lead.phone && lead.phone.trim().length > 0;
            return (
              <button
                key={lead.id}
                onClick={() => hasPhone && onSelect(lead)}
                disabled={!hasPhone}
                title={hasPhone ? undefined : "Lead sem telefone — não é possível agendar"}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left border-b border-input/30 last:border-b-0 transition-colors",
                  hasPhone
                    ? "hover:bg-secondary/60 cursor-pointer"
                    : "opacity-40 cursor-not-allowed"
                )}
              >
                <div>
                  <p className="text-sm font-medium">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasPhone ? lead.phone : "Sem telefone cadastrado"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {taggedLeads.length} lead{taggedLeads.length !== 1 ? "s" : ""} com tag "agendamento"
      </p>
    </div>
  );
}
