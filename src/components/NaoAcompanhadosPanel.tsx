import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Filter, X, UserX, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRDate } from "@/lib/timezone";

interface NaoAcompanhadoRow {
  id: string;
  agendamento_id: string;
  motivo_nao_fechamento: string | null;
  explicacao_nao_fechamento: string | null;
  observacoes: string | null;
  created_at: string;
  agendamentos: {
    lead_name: string;
    lead_phone: string;
    scheduled_date: string;
    scheduled_time: string;
    closer_id: string | null;
    deleted_at: string | null;
    closers: { name: string } | null;
  } | null;
}

export default function NaoAcompanhadosPanel() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["nao-acompanhados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(`
          id, agendamento_id, motivo_nao_fechamento, explicacao_nao_fechamento,
          observacoes, created_at,
          agendamentos!inner (
            lead_name, lead_phone, scheduled_date, scheduled_time,
            closer_id, deleted_at,
            closers ( name )
          )
        `)
        .eq("vendeu", false)
        .eq("follow_up", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as NaoAcompanhadoRow[]).filter(
        (r) => !r.agendamentos?.deleted_at,
      );
    },
  });

  const { data: closersList = [] } = useQuery({
    queryKey: ["nao-acompanhados-closers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const [filterCloser, setFilterCloser] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);

  const hasActiveFilters =
    filterCloser !== "all" || !!filterSearch.trim() || !!filterDate;

  const clearFilters = () => {
    setFilterCloser("all");
    setFilterSearch("");
    setFilterDate(undefined);
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterCloser !== "all" && r.agendamentos?.closer_id !== filterCloser) return false;
      if (filterDate && r.agendamentos?.scheduled_date !== format(filterDate, "yyyy-MM-dd")) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        const lead = (r.agendamentos?.lead_name || "").toLowerCase();
        const phone = (r.agendamentos?.lead_phone || "").toLowerCase();
        if (!lead.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterCloser, filterSearch, filterDate]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mr-1">
              <Filter className="h-4 w-4" />
              Filtros
            </div>

            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">Buscar lead</Label>
              <Input
                placeholder="Nome ou telefone"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="min-w-[140px]">
              <Label className="text-xs">Data da reunião</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !filterDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {filterDate ? format(filterDate, "dd/MM/yyyy", { locale: ptBR }) : "Qualquer"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={filterDate} onSelect={setFilterDate} locale={ptBR} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-[160px]">
              <Label className="text-xs">Closer</Label>
              <Select value={filterCloser} onValueChange={setFilterCloser}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {closersList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            {filtered.length} de {rows.length} lead{rows.length !== 1 ? "s" : ""} não acompanhado{rows.length !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {rows.length === 0
              ? "Nenhum lead foi marcado como 'não acompanhar' até o momento."
              : "Nenhum registro corresponde aos filtros aplicados."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserX className="h-4 w-4 text-destructive" />
              Leads não acompanhados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-card p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.agendamentos?.lead_name}</span>
                  {r.agendamentos?.lead_phone && (
                    <span className="text-xs text-muted-foreground">· {r.agendamentos.lead_phone}</span>
                  )}
                  {r.motivo_nao_fechamento && (
                    <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                      {r.motivo_nao_fechamento}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Reunião: {r.agendamentos?.scheduled_date && formatBRDate(r.agendamentos.scheduled_date + "T12:00:00")}
                  {r.agendamentos?.scheduled_time && ` às ${r.agendamentos.scheduled_time}`}
                  {r.agendamentos?.closers?.name && (
                    <> · Closer: <strong>{r.agendamentos.closers.name}</strong></>
                  )}
                </p>
                {r.explicacao_nao_fechamento && (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {r.explicacao_nao_fechamento}
                  </p>
                )}
                {r.observacoes && (
                  <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                    Obs: {r.observacoes}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
