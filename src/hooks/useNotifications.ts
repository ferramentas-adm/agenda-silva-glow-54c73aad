import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

const QUERY_KEY = ["notifications"] as const;

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasMountedRef = useRef(false);

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  // Realtime: escuta inserts para o usuário atual
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-stream-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          // Toast no canto da tela
          toast(n.title, { description: n.message });
          // Atualiza cache adicionando no topo
          queryClient.setQueryData<Notification[]>(QUERY_KEY, (old) => {
            const next = old ? [n, ...old] : [n];
            return next.slice(0, 50);
          });
        }
      )
      .subscribe();

    hasMountedRef.current = true;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const markAsRead = async (id: string) => {
    const now = new Date().toISOString();
    queryClient.setQueryData<Notification[]>(QUERY_KEY, (old) =>
      old?.map((n) => (n.id === id ? { ...n, read_at: now } : n)) ?? []
    );
    await supabase.from("notifications").update({ read_at: now }).eq("id", id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    queryClient.setQueryData<Notification[]>(QUERY_KEY, (old) =>
      old?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? []
    );
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
  };

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return { notifications, unreadCount, markAsRead, markAllAsRead, isLoading: query.isLoading };
}
