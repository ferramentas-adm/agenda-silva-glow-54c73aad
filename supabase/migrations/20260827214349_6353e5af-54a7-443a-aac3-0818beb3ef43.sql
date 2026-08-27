REVOKE ALL ON FUNCTION public.can_toggle_user_active(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_toggle_user_active(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_toggle_user_active(uuid) FROM authenticated;