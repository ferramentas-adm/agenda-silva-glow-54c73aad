import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, X, Tag, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { buscarLeadsComTag, type DataCrazyLead } from "@/services/datacrazy";

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
  const { data: taggedLeads = [], isLoading, error, isFetching } = useQuery<Lead[]>({
    queryKey: ["datacrazy-leads-agendamento"],
    queryFn: async () => {
      const dcLeads = await buscarLeadsComTag("agendamento");
      return dcLeads.map(mapToLead);
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

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
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
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
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-card py-10 text-center">
        <Tag className="h-8 w-8 text-primary" />
        <p className="text-sm font-medium text-foreground">
          Nenhum lead disponível para agendamento.
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Adicione a tag <span className="font-semibold text-primary">"agendamento"</span> ao lead no DataCrazy para que ele apareça aqui.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="mt-2 gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
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
          filteredLeads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => onSelect(lead)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60 transition-colors border-b border-input/30 last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.phone}</p>
              </div>
            </button>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {taggedLeads.length} lead{taggedLeads.length !== 1 ? "s" : ""} com tag "agendamento"
      </p>
    </div>
  );
}
