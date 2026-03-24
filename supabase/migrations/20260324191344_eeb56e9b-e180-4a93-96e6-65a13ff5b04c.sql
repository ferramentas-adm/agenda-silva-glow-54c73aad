
-- Drop the overly permissive policy - the existing "Creator or gestor can update agendamentos" already handles this
DROP POLICY IF EXISTS "Authenticated can soft-delete agendamentos" ON public.agendamentos;
