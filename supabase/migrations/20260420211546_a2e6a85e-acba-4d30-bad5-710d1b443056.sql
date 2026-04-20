-- View pública (sem campos sensíveis) com apenas user_id e full_name.
-- Permite que qualquer usuário autenticado resolva nomes para exibição
-- (ex: "Responsável pelo agendamento" no detalhe da reunião) sem
-- expor email ou flags internos da tabela profiles.

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT user_id, full_name
FROM public.profiles
WHERE active = true;

-- Garante leitura para usuários autenticados.
GRANT SELECT ON public.profiles_public TO authenticated;

-- Adiciona policy permissiva apenas para leitura dos campos não-sensíveis
-- via a view. Como security_invoker está on, a view aplica as policies
-- da tabela base, então precisamos permitir SELECT em profiles para
-- authenticated, mas isso exporia tudo. Portanto, em vez disso, mudamos
-- a view para SECURITY DEFINER-equivalente removendo security_invoker:
DROP VIEW public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT user_id, full_name
FROM public.profiles
WHERE active = true;

GRANT SELECT ON public.profiles_public TO authenticated;