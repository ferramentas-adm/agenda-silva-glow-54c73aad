DROP POLICY IF EXISTS "Managers can update closer blocks" ON public.closer_blocks;
CREATE POLICY "Managers can update closer blocks"
ON public.closer_blocks
FOR UPDATE
TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());