-- Allow gestors to delete closers
CREATE POLICY "Gestors can delete closers"
  ON public.closers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role));

-- Allow gestors to update profiles (for toggling active)
CREATE POLICY "Gestors can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role));
