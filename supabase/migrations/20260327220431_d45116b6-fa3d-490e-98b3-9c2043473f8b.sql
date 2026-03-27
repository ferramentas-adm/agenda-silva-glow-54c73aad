CREATE POLICY "Closers can read own google tokens"
ON public.closer_google_tokens
FOR SELECT
TO authenticated
USING (
  closer_id IN (
    SELECT c.id FROM public.closers c
    JOIN public.profiles p ON p.email = c.email
    WHERE p.user_id = auth.uid()
  )
);