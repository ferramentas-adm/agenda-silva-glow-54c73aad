import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "sdr" | "gestor" | "closer" | "moderador";

export type PermissionKey =
  | "view_calendar"
  | "view_meetings"
  | "view_follow_ups"
  | "manage_tasks"
  | "view_dashboard_comercial"
  | "manage_payments"
  | "view_payments"
  | "view_admin"
  | "view_audit_logs"
  | "create_appointment";

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; description: string }> = {
  view_calendar:           { label: "Calendário",            description: "Acesso à página de calendário e agendamentos" },
  view_meetings:           { label: "Lista de Reuniões",     description: "Visualizar a lista completa de reuniões" },
  view_follow_ups:         { label: "Follow-ups",            description: "Acessar a área de follow-ups" },
  manage_tasks:            { label: "Gerenciar Tarefas",     description: "Criar, editar e remover tarefas em Follow-ups" },
  view_dashboard_comercial:{ label: "Dashboard Comercial",   description: "Visualizar painéis e métricas comerciais" },
  view_payments:           { label: "Visualizar Pagamentos", description: "Acessar o módulo de pagamentos" },
  manage_payments:         { label: "Gerenciar Pagamentos",  description: "Criar, editar e excluir pagamentos" },
  view_admin:              { label: "Configurações",         description: "Acesso à área de Administração" },
  view_audit_logs:         { label: "Logs de Auditoria",     description: "Visualizar histórico de atividades do sistema" },
  create_appointment:      { label: "Criar Agendamento",     description: "Permissão para agendar novas reuniões" },
};

export const ALL_ROLES: AppRole[] = ["gestor", "moderador", "closer", "sdr"];

interface RolePermissionRow {
  role: AppRole;
  permission_key: PermissionKey;
  allowed: boolean;
}

/**
 * Hook que retorna o mapa de permissões da role do usuário corrente.
 * As permissões da matriz controlam APENAS o que aparece no UI.
 * As políticas RLS do Supabase continuam sendo a camada definitiva de segurança.
 */
export function usePermissions() {
  const { role } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["role-permissions"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, permission_key, allowed");
      if (error) throw error;
      return (data ?? []) as unknown as RolePermissionRow[];
    },
  });

  const can = (key: PermissionKey): boolean => {
    if (!role) return false;
    if (!data) return false;
    const match = data.find((r) => r.role === role && r.permission_key === key);
    return match?.allowed ?? false;
  };

  return { can, isLoading, raw: data ?? [] };
}

/**
 * Hook auxiliar para uma única permissão (mais conveniente em componentes).
 */
export function useCan(key: PermissionKey): boolean {
  const { can } = usePermissions();
  return can(key);
}
