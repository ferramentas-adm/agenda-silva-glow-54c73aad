
-- Fix overly permissive UPDATE policy
DROP POLICY "Authenticated users can update agendamentos" ON public.agendamentos;

-- Only the creator or a gestor can update agendamentos
CREATE POLICY "Creator or gestor can update agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor'));
