-- Remove a view criada anteriormente (gera alerta de Security Definer View).
DROP VIEW IF EXISTS public.profiles_public;

-- Substitui por uma função SECURITY DEFINER que devolve apenas
-- user_id e full_name dos perfis ativos. Não expõe email nem flags
-- sensíveis. Pode ser chamada por qualquer usuário autenticado.
CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE (user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.full_name
  FROM public.profiles p
  WHERE p.active = true
  ORDER BY p.full_name;
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated;