import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Plus, Trash2, Repeat, CalendarDays } from "lucide-react";
import { format, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";

// Defaults usados se a lista dinâmica ainda não foi populada
const DEFAULT_BLOCK_REASONS = ["Almoço", "Compromisso pessoal", "Folga", "Reunião interna", "Treinamento"];

// Mapa para retrocompatibilidade com valores antigos (slug -> label)
const LEGACY_BLOCK_LABELS: Record<string, string> = {
  almoco: "Almoço",
  pessoal: "Compromisso pessoal",
  externo: "Compromisso externo",
  folga: "Folga / Day off",
  outro: "Outro",
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Mode = "pontual" | "recorrente";

interface CloserBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CloserBlockDialog({ open, onOpenChange }: CloserBlockDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("pontual");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const { items: blockReasons } = useAppSettingList(APP_SETTING_KEYS.block_reasons, DEFAULT_BLOCK_REASONS);
  const [blockType, setBlockType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Find closer record for current user
  const { data: closerRecord } = useQuery({
    queryKey: ["my-closer-record", user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id").eq("email", user!.email!).single();
      return data;
    },
  });

  // List existing blocks
  const { data: myBlocks = [] } = useQuery({
    queryKey: ["closer-blocks", closerRecord?.id],
    enabled: !!closerRecord?.id,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("closer_blocks")
        .select("*")
        .eq("closer_id", closerRecord!.id)
        .or(`is_recurring.eq.true,block_date.gte.${today}`)
        .order("is_recurring", { ascending: false })
        .order("block_date")
        .order("start_time");
      return data ?? [];
    },
  });

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const resetForm = () => {
    setDate(undefined);
    setWeekdays([]);
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!closerRecord) return;
    if (mode === "pontual" && !date) {
      toast.error("Selecione uma data");
      return;
    }
    if (mode === "recorrente" && weekdays.length === 0) {
      toast.error("Selecione ao menos um dia da semana");
      return;
    }
    if (startTime >= endTime) {
      toast.error("Horário de fim deve ser depois do início");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "pontual") {
        const dateStr = format(date!, "yyyy-MM-dd");
        const { error } = await supabase.from("closer_blocks").insert({
          closer_id: closerRecord.id,
          block_date: dateStr,
          start_time: startTime,
          end_time: endTime,
          block_type: blockType,
          description: description || null,
          is_recurring: false,
          recurrence_weekday: null,
        });
        if (error) throw error;
        toast.success("Compromisso adicionado!");
      } else {
        // Um registro por dia da semana selecionado
        const today = format(new Date(), "yyyy-MM-dd");
        const rows = weekdays.map((wd) => ({
          closer_id: closerRecord.id,
          block_date: today, // placeholder; lógica de bloqueio usa is_recurring + weekday
          start_time: startTime,
          end_time: endTime,
          block_type: blockType,
          description: description || null,
          is_recurring: true,
          recurrence_weekday: wd,
        }));
        const { error } = await supabase.from("closer_blocks").insert(rows);
        if (error) throw error;
        toast.success(
          weekdays.length === 1
            ? "Compromisso recorrente adicionado!"
            : `${weekdays.length} compromissos recorrentes adicionados!`
        );
      }

      queryClient.invalidateQueries({ queryKey: ["closer-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-day"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar compromisso");
    }
    setSubmitting(false);
  };

  const handleDelete = async (blockId: string) => {
    try {
      const { error } = await supabase.from("closer_blocks").delete().eq("id", blockId);
      if (error) throw error;
      toast.success("Compromisso removido!");
      queryClient.invalidateQueries({ queryKey: ["closer-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-day"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    }
  };

  const typeLabel = (t: string) => LEGACY_BLOCK_LABELS[t] || t;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Meus Compromissos Pessoais</DialogTitle>
          <DialogDescription>
            Adicione bloqueios na sua agenda. O time de SDR verá o motivo e horário bloqueado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-primary/10 p-4">
            {/* Seletor de modo */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "pontual" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setMode("pontual")}
              >
                <CalendarIcon className="h-4 w-4" />
                Pontual
              </Button>
              <Button
                type="button"
                variant={mode === "recorrente" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setMode("recorrente")}
              >
                <Repeat className="h-4 w-4" />
                Recorrente
              </Button>
            </div>

            {/* Pontual: data | Recorrente: dias da semana */}
            {mode === "pontual" ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal text-sm",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy") : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return d < today;
                    }}
                    locale={ptBR}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Dias da semana
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS_SHORT.map((label, idx) => {
                    const active = weekdays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeekday(idx)}
                        className={cn(
                          "rounded-md border text-xs font-medium py-2 transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-input hover:bg-secondary"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Motivo</label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {blockReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Horários */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Início</label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fim</label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="font-mono text-sm" />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
              <Input
                placeholder="Ex: reunião externa, consulta médica..."
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 100))}
                className="text-sm"
              />
            </div>

            {mode === "recorrente" && weekdays.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Bloqueará{" "}
                <strong>
                  {weekdays.map((d) => WEEKDAYS[d]).join(", ")}
                </strong>{" "}
                no horário {startTime}–{endTime}.
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || (mode === "pontual" ? !date : weekdays.length === 0)}
              className="w-full gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>

          {myBlocks.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <p className="text-xs font-medium text-muted-foreground">Meus compromissos</p>
              {myBlocks.map((block: any) => (
                <div key={block.id} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{typeLabel(block.block_type)}</span>
                      {block.is_recurring && (
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5 border-primary/30 text-primary">
                          <Repeat className="h-2.5 w-2.5" />
                          Toda {WEEKDAYS[block.recurrence_weekday ?? 0]}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {block.is_recurring
                        ? `${block.start_time}–${block.end_time}`
                        : `${format(new Date(block.block_date + "T12:00:00"), "dd/MM")} · ${block.start_time}–${block.end_time}`}
                      {block.description && ` — ${block.description}`}
                    </span>
                  </div>
                  <button onClick={() => handleDelete(block.id)} className="text-destructive hover:text-destructive/80 shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
