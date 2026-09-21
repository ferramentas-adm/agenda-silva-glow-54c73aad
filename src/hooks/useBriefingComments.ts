import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BriefingComment {
  id: string;
  agendamento_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/**
 * Comentários/briefings adicionais de um agendamento.
 * Cada SDR adiciona o seu próprio comentário; ninguém edita o do outro
 * (a política RLS garante isso no banco). O closer vê todos.
 */
export function useBriefingComments(agendamentoId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = ["briefing-comments", agendamentoId];

  const { data: comments = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!agendamentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamento_briefings")
        .select("id, agendamento_id, author_id, content, created_at, updated_at")
        .eq("agendamento_id", agendamentoId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BriefingComment[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: async (content: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || !agendamentoId) throw new Error("Sessão expirada. Entre novamente.");
      const { error } = await supabase
        .from("agendamento_briefings")
        .insert({ agendamento_id: agendamentoId, author_id: uid, content: content.trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const edit = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { data, error } = await supabase
        .from("agendamento_briefings")
        .update({ content: content.trim() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você só pode editar os seus próprios comentários.");
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("agendamento_briefings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você só pode remover os seus próprios comentários.");
    },
    onSuccess: invalidate,
  });

  return { comments, isLoading, add, edit, remove };
}
