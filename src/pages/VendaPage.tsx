import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import VendaDialog from "@/components/VendaDialog";

export default function VendaPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const leadName = params.get("lead") ?? "Lead";

  const goBack = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] }),
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] }),
      queryClient.invalidateQueries({ queryKey: ["pending-meetings"] }),
      queryClient.invalidateQueries({ queryKey: ["vendas-tab"] }),
      queryClient.invalidateQueries({ queryKey: ["vendas-tab-followup-closes"] }),
      queryClient.invalidateQueries({ queryKey: ["vendas-agendamento-ids"] }),
      queryClient.invalidateQueries({ queryKey: ["reunioes-list"] }),
    ]);
    navigate("/");
  };

  if (!id) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Registrar resultado da reunião</h1>
        <p className="text-muted-foreground mb-6">Lead: <strong>{leadName}</strong></p>
        <VendaDialog
          open={true}
          onOpenChange={(o) => { if (!o) goBack(); }}
          agendamentoId={id}
          leadName={leadName}
          onSuccess={goBack}
        />
      </div>
    </div>
  );
}
