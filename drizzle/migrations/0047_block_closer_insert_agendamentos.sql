DROP POLICY IF EXISTS "Authenticated users can create agendamentos" ON public.agendamentos;
CREATE POLICY "Authenticated users can create agendamentos" ON public.agendamentos
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = created_by
  AND NOT (
    public.has_role((SELECT auth.uid()), 'closer')
    AND NOT COALESCE((SELECT p.is_sdr_override FROM public.profiles p WHERE p.user_id = (SELECT auth.uid())), false)
  )
);