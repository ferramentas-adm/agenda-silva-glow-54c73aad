import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import { useCloserFilter } from "@/hooks/useCloserFilter";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PlusCircle, CalendarOff } from "lucide-react";

type ViewMode = "week" | "day";

export default function DashboardPage() {
  const { closers, selectedIds, toggle, isLoading } = useCloserFilter();
  const { pendingCount, syncing, syncNow } = useDataCrazySync();
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4">
        <DataCrazySyncIndicator pendingCount={pendingCount} syncing={syncing} onSyncNow={syncNow} />

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Seus agendamentos aparecerão aqui.</p>
        </div>

        {/* View toggle + closer filter */}
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
            <button
              onClick={() => setViewMode("week")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "day"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dia
            </button>
          </div>

          {isLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <CloserFilterBar closers={closers} selectedIds={selectedIds} onToggle={toggle} />
            </div>
          )}
        </div>

        {/* Loading skeleton for agenda cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : viewMode === "day" ? (
          /* Day view — column per closer with time grid */
          <DayView closers={closers.filter(c => selectedIds.has(c.id))} />
        ) : (
          /* Week view — empty state for now */
          <div className="rounded-xl border border-dashed border-primary/20 bg-card flex flex-col items-center justify-center py-16 text-center">
            <CalendarOff className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">Sem reuniões agendadas</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              {closers.length > 0
                ? `${selectedIds.size} de ${closers.length} closers selecionados. Crie um novo agendamento para começar.`
                : "Cadastre closers em /admin para começar."}
            </p>
            <Link to="/agendar" className="mt-4">
              <Button size="sm" className="gap-2">
                <PlusCircle className="h-4 w-4" />
                Agendar lead
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Day View Component ──────────────────────────────────────────

const DAY_HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

function DayView({ closers }: { closers: { id: string; name: string }[] }) {
  if (closers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-primary/20 bg-card py-12 text-center">
        <p className="text-sm text-muted-foreground">Selecione ao menos um closer para ver a agenda do dia.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-primary/10 bg-card">
      <div className="grid" style={{ gridTemplateColumns: `60px repeat(${closers.length}, minmax(140px, 1fr))` }}>
        {/* Header */}
        <div className="border-b border-primary/10 p-2" />
        {closers.map((c) => (
          <div key={c.id} className="border-b border-l border-primary/10 p-2 text-center">
            <span className="text-xs font-medium">{c.name}</span>
          </div>
        ))}

        {/* Time rows */}
        {DAY_HOURS.map((hour) => (
          <>
            <div key={`h-${hour}`} className="border-b border-primary/5 px-2 py-3 text-right">
              <span className="text-[10px] text-muted-foreground font-mono">{hour}</span>
            </div>
            {closers.map((c) => (
              <div
                key={`${c.id}-${hour}`}
                className="border-b border-l border-primary/5 px-1 py-3 min-h-[44px]"
              />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}
