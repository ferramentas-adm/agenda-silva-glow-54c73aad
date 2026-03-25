
-- Fix the "Closers can update own hours" policy to use auth.email() instead of querying auth.users
DROP POLICY IF EXISTS "Closers can update own hours" ON public.closers;

CREATE POLICY "Closers can update own hours"
ON public.closers
FOR UPDATE
TO authenticated
USING (email = auth.email())
WITH CHECK (email = auth.email());
