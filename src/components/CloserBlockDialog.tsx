import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Plus, Trash2, Repeat } from "lucide-react";
import { format, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BLOCK_TYPES = [
  { value: "almoco", label: "Almoço" },
  { value: "pessoal", label: "Compromisso pessoal" },
  { value: "externo", label: "Compromisso externo" },
  { value: "folga", label: "Folga / Day off" },
  { value: "outro", label: "Outro" },
];

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface CloserBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CloserBlockDialog({ open, onOpenChange }: CloserBlockDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [blockType, setBlockType] = useState("almoco");
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
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

  // List existing blocks (próximos não-recorrentes + todos os recorrentes)
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

  const handleSubmit = async () => {
    if (!closerRecord || !date) return;
    setSubmitting(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const payload: any = {
        closer_id: closerRecord.id,
        block_date: dateStr,
        start_time: startTime,
        end_time: endTime,
        block_type: blockType,
        description: description || null,
        is_recurring: isRecurring,
        recurrence_weekday: isRecurring ? getDay(date) : null,
      };
      const { error } = await supabase.from("closer_blocks").insert(payload);
      if (error) throw error;
      toast.success(isRecurring ? "Compromisso recorrente adicionado!" : "Compromisso adicionado!");
      queryClient.invalidateQueries({ queryKey: ["closer-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-day"] });
      queryClient.invalidateQueries({ queryKey: ["closer-blocks-slots"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
      setDate(undefined);
      setDescription("");
      setIsRecurring(false);
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

  const typeLabel = (t: string) => BLOCK_TYPES.find((bt) => bt.value === t)?.label || t;

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
            <div className="grid grid-cols-2 gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy") : "Data"}
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
                  />
                </PopoverContent>
              </Popover>

              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map((bt) => (
                    <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            <Input
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 100))}
              className="text-sm"
            />

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <Checkbox
                checked={isRecurring}
                onCheckedChange={(v) => setIsRecurring(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-tight">
                Repetir semanalmente
                {date && isRecurring && (
                  <span className="block text-xs text-muted-foreground">
                    Bloqueará todas as <strong>{WEEKDAYS[getDay(date)]}</strong> nesse horário.
                  </span>
                )}
                {!date && isRecurring && (
                  <span className="block text-xs text-muted-foreground">
                    Selecione uma data para definir o dia da semana.
                  </span>
                )}
              </span>
            </label>

            <Button onClick={handleSubmit} disabled={submitting || !date} className="w-full gap-2" size="sm">
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
