-- Restringir Closer: só pode VER e ATUALIZAR agendamentos onde ele é o closer designado.
-- Gestor/Moderador continuam com acesso amplo. SDR só vê/atualiza os que criou.

-- 1) SELECT: substitui a policy aberta atual por uma com restrição por papel
DROP POLICY IF EXISTS "Authenticated users can view agendamentos" ON public.agendamentos;

CREATE POLICY "Users can view agendamentos by role"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (
  -- Gestor e Moderador veem tudo
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'moderador'::app_role)
  -- SDR vê o que criou ou onde está marcado como responsável
  OR (auth.uid() = created_by)
  OR (auth.uid() = sdr_responsavel_id)
  -- Closer vê apenas os agendamentos onde ele é o closer designado
  OR (
    public.has_role(auth.uid(), 'closer'::app_role)
    AND closer_id IN (
      SELECT c.id FROM public.closers c WHERE c.email = auth.email()
    )
  )
);

-- 2) UPDATE: Closer só pode alterar agendamentos próprios (onde é o closer_id)
DROP POLICY IF EXISTS "Authenticated users can update agendamentos" ON public.agendamentos;

CREATE POLICY "Users can update agendamentos by role"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'moderador'::app_role)
  OR (auth.uid() = created_by)
  OR (
    public.has_role(auth.uid(), 'closer'::app_role)
    AND closer_id IN (
      SELECT c.id FROM public.closers c WHERE c.email = auth.email()
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'moderador'::app_role)
  OR (auth.uid() = created_by)
  OR (
    public.has_role(auth.uid(), 'closer'::app_role)
    AND closer_id IN (
      SELECT c.id FROM public.closers c WHERE c.email = auth.email()
    )
  )
);