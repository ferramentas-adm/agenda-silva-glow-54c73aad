import AppLayout from "@/components/AppLayout";

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Seus agendamentos aparecerão aqui.</p>
        </div>

        {/* Empty state */}
        <div className="card-meeting flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Nenhum agendamento por enquanto.</p>
          <p className="mt-1 text-xs text-muted-foreground">A lógica de agenda será implementada em breve.</p>
        </div>
      </div>
    </AppLayout>
  );
}
