-- Allow moderadores to manage app_settings (in addition to gestores)
DROP POLICY IF EXISTS "Gestors can manage settings" ON public.app_settings;

CREATE POLICY "Managers can manage settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role));