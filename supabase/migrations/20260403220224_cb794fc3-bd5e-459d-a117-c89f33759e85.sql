CREATE POLICY "Moderadores can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderador'::app_role));