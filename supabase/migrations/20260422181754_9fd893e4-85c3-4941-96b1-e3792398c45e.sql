DROP POLICY IF EXISTS "Allowed users can update vendas" ON public.vendas;

CREATE POLICY "Allowed users can update vendas"
ON public.vendas
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = vendas.agendamento_id
      AND (
        a.created_by = auth.uid()
        OR (
          has_role(auth.uid(), 'closer'::app_role)
          AND a.closer_id IN (
            SELECT c.id
            FROM public.closers c
            WHERE c.email = auth.email()
          )
        )
      )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = vendas.agendamento_id
      AND (
        a.created_by = auth.uid()
        OR (
          has_role(auth.uid(), 'closer'::app_role)
          AND a.closer_id IN (
            SELECT c.id
            FROM public.closers c
            WHERE c.email = auth.email()
          )
        )
      )
  )
);