DROP POLICY IF EXISTS "Users can update agendamentos by role" ON public.agendamentos;

CREATE POLICY "Users can update agendamentos by role"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'sdr'::app_role)
  OR (auth.uid() = created_by)
  OR (
    has_role(auth.uid(), 'closer'::app_role)
    AND closer_id IN (SELECT c.id FROM closers c WHERE c.email = auth.email())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'sdr'::app_role)
  OR (auth.uid() = created_by)
  OR (
    has_role(auth.uid(), 'closer'::app_role)
    AND closer_id IN (SELECT c.id FROM closers c WHERE c.email = auth.email())
  )
);