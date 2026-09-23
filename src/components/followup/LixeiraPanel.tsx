import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatBRDate } from "@/lib/timezone";
import { FOLLOWUP_SELECT, type FollowUpRecord } from "@/components/followup/types";

/** Lixeira: histórico dos follow-ups arquivados antes do recomeço da operação. */
export default function LixeiraPanel() {
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["follow-ups-lixeira"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(FOLLOWUP_SELECT)
        .eq("follow_up", true)
        .eq("follow_up_status", "lixeira")
        .order("follow_up_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRecord[];
    },
  });

  const visible = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (i.agendamentos?.lead_name || "").toLowerCase().includes(q) ||
      (i.agendamentos?.lead_phone || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            Lixeira
            <Badge variant="outline">{visible.length}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Follow-ups antigos arquivados para a operação começar zerada. Nada foi apagado — este
            histórico continua disponível para consulta.
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Buscar por nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum registro na lixeira.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 pt-4">
            {visible.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{i.agendamentos?.lead_name}</span>
                  {i.agendamentos?.lead_phone && (
                    <span className="text-xs text-muted-foreground">{i.agendamentos.lead_phone}</span>
                  )}
                  {i.agendamentos?.closers?.name && (
                    <Badge variant="secondary" className="text-[10px]">{i.agendamentos.closers.name}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {i.follow_up_date ? `Combinado para ${formatBRDate(`${i.follow_up_date}T12:00:00Z`)}` : "Sem data"}
                  {i.follow_up_time && ` · ${i.follow_up_time}`}
                </div>
                {i.motivo_nao_fechamento && (
                  <p className="text-xs text-foreground/80 mt-1">
                    <span className="font-semibold text-muted-foreground">Motivo: </span>
                    {i.motivo_nao_fechamento}
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
