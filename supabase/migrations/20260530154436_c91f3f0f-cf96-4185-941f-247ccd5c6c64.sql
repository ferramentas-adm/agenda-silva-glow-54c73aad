
-- 1) Lock down SECURITY DEFINER function EXECUTE so anon/public cannot call them.
--    Trigger functions: revoke from everyone (only invoked internally by triggers).
REVOKE EXECUTE ON FUNCTION public.notify_crm_sync()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_and_mark_reschedule()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_initial_agendamento_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_status_change()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_status_change_webhook()  FROM PUBLIC, anon, authenticated;

-- RPC/helper functions: keep callable by authenticated, but block anon/public.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_public_profiles()           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_public_profiles()           TO authenticated;

-- 2) Restrict Realtime topic subscription so a user cannot listen to another
--    user's per-user channel (e.g. `notifications-stream-<other_user_id>`).
--    Other channels (agendamentos-realtime-*, postgres_changes-only topics)
--    remain open to authenticated users — postgres RLS on the underlying
--    tables already restricts which rows they actually receive.
DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;

CREATE POLICY "Authenticated can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Per-user notification channels: only the owner of the user_id in the
  -- topic name can subscribe.
  CASE
    WHEN realtime.topic() LIKE 'notifications-stream-%'
      THEN realtime.topic() = 'notifications-stream-' || auth.uid()::text
    ELSE true
  END
);
