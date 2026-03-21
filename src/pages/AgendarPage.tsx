import AppLayout from "@/components/AppLayout";

export default function AgendarPage() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Agendamento</h1>
          <p className="text-sm text-muted-foreground">Formulário de agendamento será implementado aqui.</p>
        </div>

        <div className="card-meeting flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Em breve você poderá agendar reuniões por aqui.</p>
        </div>
      </div>
    </AppLayout>
  );
}
