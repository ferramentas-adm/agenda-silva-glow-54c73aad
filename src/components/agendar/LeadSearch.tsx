import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { searchLeads, type Lead } from "@/data/mockLeads";

interface LeadSearchProps {
  selectedLead: Lead | null;
  onSelect: (lead: Lead) => void;
  onClear: () => void;
}

export default function LeadSearch({ selectedLead, onSelect, onClear }: LeadSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResults(searchLeads(query));
    setOpen(query.length >= 2);
  }, [query]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
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

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar lead por nome ou telefone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-input bg-popover shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum lead encontrado.</p>
          ) : (
            results.map((lead) => (
              <button
                key={lead.id}
                onClick={() => {
                  onSelect(lead);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {lead.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.phone}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
