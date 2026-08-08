import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CriadasDayGroup {
  date: string; // yyyy-MM-dd
  ids: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodLabel: string;
  groups: CriadasDayGroup[];
  onSelectDay: (date: string, ids: string[]) => void;
}

export default function CriadasPorDiaDialog({
  open,
  onOpenChange,
  periodLabel,
  groups,
  onSelectDay,
}: Props) {
  const total = groups.reduce((s, g) => s + g.ids.length, 0);
  const max = groups.reduce((m, g) => Math.max(m, g.ids.length), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Criadas em {periodLabel}
          </DialogTitle>
          <DialogDescription>
            Distribuição por dia para o qual essas agendas foram marcadas.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-muted-foreground">
            Nenhuma agenda criada no período.
          </p>
        ) : (
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {groups.map((g) => {
              const pct = total > 0 ? (g.ids.length / total) * 100 : 0;
              return (
                <button
                  key={g.date}
                  onClick={() => onSelectDay(g.date, g.ids)}
                  className="w-full rounded-lg border border-primary/10 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">
                      {format(parseISO(g.date), "EEE, dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span className="ml-auto text-sm font-bold text-primary">
                      {g.ids.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({pct.toFixed(0)}%)
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${max > 0 ? (g.ids.length / max) * 100 : 0}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Total de agendas criadas</span>
          <span className="font-bold">{total}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
