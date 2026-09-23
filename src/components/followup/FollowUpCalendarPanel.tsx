import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Phone, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMyCloserId } from "@/hooks/useMyCloserId";
import { brTodayYMD, pickedDateToYMD } from "@/lib/timezone";
import { temperaturaBadgeClass, temperaturaDotClass, temperaturaLabel, canalLabel } from "@/lib/followUp";
import { FOLLOWUP_SELECT, type FollowUpRecord } from "@/components/followup/types";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Calendário mensal dos follow-ups combinados, colorido pela chance de fechar. */
export default function FollowUpCalendarPanel() {
  const { role } = useAuth();
  const isCloser = role === "closer";
  const { data: myCloserId } = useMyCloserId();
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selected, setSelected] = useState<string | null>(brTodayYMD());

  const from = pickedDateToYMD(startOfMonth(cursor));
  const to = pickedDateToYMD(endOfMonth(cursor));

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["follow-up-calendar", from, to, myCloserId, isCloser],
    enabled: !isCloser || !!myCloserId,
    queryFn: async () => {
      let query = supabase
        .from("vendas")
        .select(FOLLOWUP_SELECT)
        .eq("follow_up", true)
        .eq("vendeu", false)
        .eq("follow_up_status", "ativo")
        .gte("follow_up_date", from)
        .lte("follow_up_date", to);
      if (isCloser && myCloserId) query = query.eq("agendamentos.closer_id", myCloserId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRecord[];
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, FollowUpRecord[]>();
    for (const i of items) {
      if (!i.follow_up_date) continue;
      const list = map.get(i.follow_up_date) ?? [];
      list.push(i);
      map.set(i.follow_up_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.follow_up_time || "99:99").localeCompare(b.follow_up_time || "99:99"));
    }
    return map;
  }, [items]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { locale: ptBR }),
    end: endOfWeek(endOfMonth(cursor), { locale: ptBR }),
  });

  const selectedItems = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base capitalize">
            {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Hoje</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const ymd = pickedDateToYMD(d);
                  const list = byDay.get(ymd) ?? [];
                  const isOut = !isSameMonth(d, cursor);
                  const isToday = ymd === brTodayYMD();
                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => setSelected(ymd)}
                      className={cn(
                        "min-h-[76px] rounded-md border p-1.5 text-left transition-colors",
                        isOut ? "opacity-40" : "",
                        selected === ymd ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-medium", isToday && "text-primary font-bold")}>
                          {format(d, "d")}
                        </span>
                        {list.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">{list.length}</span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {list.slice(0, 3).map((i) => (
                          <div key={i.id} className="flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", temperaturaDotClass(i.follow_up_temperatura))} />
                            <span className="truncate text-[10px] text-foreground/80">
                              {i.follow_up_time ? `${i.follow_up_time} ` : ""}
                              {i.agendamentos?.lead_name}
                            </span>
                          </div>
                        ))}
                        {list.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{list.length - 3}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Quente</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Morno</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Frio</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {selected ? format(new Date(`${selected}T12:00:00`), "EEEE, dd/MM/yyyy", { locale: ptBR }) : "Selecione um dia"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum follow-up neste dia.</p>
          ) : (
            selectedItems.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{i.agendamentos?.lead_name}</span>
                  <Badge variant="outline" className={cn("text-[10px]", temperaturaBadgeClass(i.follow_up_temperatura))}>
                    {temperaturaLabel(i.follow_up_temperatura)}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    {i.follow_up_canal === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                    {canalLabel(i.follow_up_canal)}
                  </Badge>
                  {!isCloser && i.agendamentos?.closers?.name && (
                    <Badge variant="outline" className="text-[10px]">{i.agendamentos.closers.name}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {i.follow_up_time ?? "sem horário"}
                  {i.follow_up_produto && ` · ${i.follow_up_produto}`}
                  {i.follow_up_valor != null && ` · R$ ${Number(i.follow_up_valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                  {` · tentativa ${i.follow_up_tentativas ?? 0}/3`}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
