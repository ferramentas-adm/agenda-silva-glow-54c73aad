import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import { useCloserFilter } from "@/hooks/useCloserFilter";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PlusCircle, CalendarOff } from "lucide-react";

export default function DashboardPage() {
  const { closers, selectedIds, toggle, isLoading } = useCloserFilter();
  const { pendingCount, syncing, syncNow } = useDataCrazySync();

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
            <button className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              Semana
            </button>
            <button className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
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
        ) : (
          /* Empty state */
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
