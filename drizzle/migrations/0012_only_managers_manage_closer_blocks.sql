DROP POLICY IF EXISTS "Closers can insert own blocks" ON public.closer_blocks;
DROP POLICY IF EXISTS "Closers can delete own blocks" ON public.closer_blocks;

CREATE POLICY "Managers can insert closer blocks"
ON public.closer_blocks
FOR INSERT
TO authenticated
WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete closer blocks"
ON public.closer_blocks
FOR DELETE
TO authenticated
USING (public.is_manager());