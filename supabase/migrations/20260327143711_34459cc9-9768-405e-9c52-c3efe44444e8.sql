
DROP POLICY "Creator or gestor can update agendamentos" ON public.agendamentos;

CREATE POLICY "Authenticated users can update agendamentos"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = created_by)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'closer'::app_role)
)
WITH CHECK (
  (auth.uid() = created_by)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'closer'::app_role)
);
