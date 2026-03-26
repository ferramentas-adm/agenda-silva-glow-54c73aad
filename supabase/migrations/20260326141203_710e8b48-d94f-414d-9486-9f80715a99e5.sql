
-- Allow moderadores to view all profiles
CREATE POLICY "Moderadores can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderador'::app_role));

-- Allow moderadores to view all roles
CREATE POLICY "Moderadores can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'moderador'::app_role));
