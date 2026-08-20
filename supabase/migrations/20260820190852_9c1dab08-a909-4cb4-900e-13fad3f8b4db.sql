REVOKE EXECUTE ON FUNCTION public.transfer_agendamento_closer(uuid, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.clear_followup_on_segunda_reuniao_sale() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_pending_closer_assignment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_closer_active_on_role_change() FROM anon, authenticated;