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
    await queryClient.invalidateQueries({ queryKey: ["overdue-meetings"] });
    await queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    await queryClient.invalidateQueries({ queryKey: ["pending-meetings"] });
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
