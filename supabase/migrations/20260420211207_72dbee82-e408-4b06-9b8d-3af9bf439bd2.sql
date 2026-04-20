-- Substitui a política de visualização de agendamentos para permitir
-- que qualquer usuário autenticado veja TODOS os agendamentos.
-- Isso evita duplicação de horários: SDRs precisam enxergar agendas
-- criadas por outros SDRs no calendário dos closers.
-- As políticas de UPDATE/INSERT continuam restritas (cada papel só
-- pode editar conforme as regras já vigentes).

DROP POLICY IF EXISTS "Users can view agendamentos by role" ON public.agendamentos;

CREATE POLICY "Authenticated users can view all agendamentos"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (true);