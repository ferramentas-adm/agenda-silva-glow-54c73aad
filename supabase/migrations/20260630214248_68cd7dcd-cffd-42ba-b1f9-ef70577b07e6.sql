DROP POLICY IF EXISTS "Supervisors can view all profiles" ON public.profiles;
CREATE POLICY "Supervisors can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Supervisors can view all roles" ON public.user_roles;
CREATE POLICY "Supervisors can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Closers can update own hours" ON public.closers;
CREATE POLICY "Closers can update own hours"
ON public.closers
FOR UPDATE
TO authenticated
USING (
  email = auth.email()
  OR public.has_role(auth.uid(), 'moderador'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  email = auth.email()
  OR public.has_role(auth.uid(), 'moderador'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);