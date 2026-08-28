GRANT EXECUTE ON FUNCTION public.can_toggle_user_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_gestor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_closer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_sdr() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_apresentador() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_closer_id() TO authenticated;