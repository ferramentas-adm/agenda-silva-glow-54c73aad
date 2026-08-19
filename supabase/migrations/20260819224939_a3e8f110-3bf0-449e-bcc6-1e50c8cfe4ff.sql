REVOKE ALL ON FUNCTION public.unassign_agendamentos_from_closer(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_closer_deactivated_unassign() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_agendamentos_from_closer(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.on_closer_deactivated_unassign() TO service_role;