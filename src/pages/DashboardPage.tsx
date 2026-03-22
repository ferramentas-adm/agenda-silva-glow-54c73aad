import AppLayout from "@/components/AppLayout";
import CloserFilterBar from "@/components/CloserFilterBar";
import { useCloserFilter } from "@/hooks/useCloserFilter";
import DataCrazySyncIndicator from "@/components/DataCrazySyncIndicator";
import { useDataCrazySync } from "@/hooks/useDataCrazySync";

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

        {/* View toggle placeholder + closer filter */}
        <div className="space-y-3">
          {/* Toggle Semana/Dia placeholder */}
          <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
            <button className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              Semana
            </button>
            <button className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              Dia
            </button>
          </div>

          {/* Closer filter */}
          {!isLoading && <CloserFilterBar closers={closers} selectedIds={selectedIds} onToggle={toggle} />}
        </div>

        {/* Empty state */}
        <div className="card-meeting flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Nenhum agendamento por enquanto.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {closers.length > 0
              ? `${selectedIds.size} de ${closers.length} closers selecionados`
              : "Cadastre closers em /admin para começar."}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
