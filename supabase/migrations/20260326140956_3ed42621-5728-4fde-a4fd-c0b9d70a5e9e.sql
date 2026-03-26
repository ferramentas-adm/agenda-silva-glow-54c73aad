
-- Add moderador to the closers update RLS policy
DROP POLICY IF EXISTS "Closers can update own hours" ON public.closers;
CREATE POLICY "Closers can update own hours"
ON public.closers
FOR UPDATE
TO authenticated
USING (
  (email = auth.email()) OR has_role(auth.uid(), 'moderador'::app_role)
)
WITH CHECK (
  (email = auth.email()) OR has_role(auth.uid(), 'moderador'::app_role)
);
