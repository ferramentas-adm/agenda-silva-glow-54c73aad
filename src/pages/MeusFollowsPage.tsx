import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import CargaClosersTab from "@/components/dashboard/CargaClosersTab";

export default function MeusFollowsPage() {
  const { user } = useAuth();

  const { data: myCloserId, isLoading } = useQuery({
    queryKey: ["my-closer-id-meus-follows", user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id")
        .eq("email", user!.email!)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Meus Follows
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumo das suas tarefas e follow-ups: atrasados, futuros e em acompanhamento.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !myCloserId ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            Seu usuário não está vinculado a um Closer ativo.
          </p>
        ) : (
          <CargaClosersTab restrictToCloserId={myCloserId} />
        )}
      </div>
    </AppLayout>
  );
}
