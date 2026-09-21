CREATE POLICY "Managers can update briefing comments"
ON public.agendamento_briefings FOR UPDATE TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());