REVOKE EXECUTE ON FUNCTION public.get_public_profiles() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_followup_on_segunda_reuniao_sale() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_pending_closer_assignment() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated, service_role;