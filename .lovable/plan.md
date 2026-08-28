# Corrigir "permission denied for function can_toggle_user_active"

## O que está acontecendo

Os dois avisos das imagens são coisas diferentes:

1. **"New password should be different from the old password"** — mensagem normal do serviço de autenticação: o usuário digitou a mesma senha antiga. Não é bug. Único ajuste desejável: traduzir para português ("A nova senha precisa ser diferente da senha atual.").

2. **"permission denied for function can_toggle_user_active"** — este é um bug real e bloqueia a troca de senha obrigatória.

## Causa (confirmada)

A regra de acesso de atualização da tabela de perfis (`profiles`) criada em 27/08 usa a função `can_toggle_user_active`. Na migração de segurança executada minutos depois, a permissão de execução dessa função foi retirada de todos os usuários logados (`REVOKE ... FROM authenticated`).

Resultado: **qualquer** atualização de perfil feita por um usuário logado passa pela regra, a regra chama a função sem permissão, e o banco recusa a operação. Na tela "Altere sua senha" isso aparece exatamente nesse momento — a senha é alterada, mas a marcação `must_change_password = false` falha, então o usuário fica preso na tela.

Isso também afeta ativar/inativar usuários no painel de Administração e qualquer outra edição de perfil.

## Correção

- Devolver a permissão de execução da função `can_toggle_user_active` para usuários logados. A função é `SECURITY DEFINER` e apenas devolve verdadeiro/falso sobre o que o próprio usuário logado pode fazer — não expõe dados. Continua sem acesso para visitantes não autenticados (`anon`).
- Traduzir a mensagem de senha repetida na tela de troca obrigatória de senha.

## Detalhes técnicos

- Migração: `GRANT EXECUTE ON FUNCTION public.can_toggle_user_active(uuid) TO authenticated;` (mantendo o revoke para `anon`/`PUBLIC`). Mesma verificação para `public.is_manager()`, `public.is_gestor()` e `public.has_role()`, usadas em políticas de RLS — se alguma também estiver sem `EXECUTE` para `authenticated`, regrantear na mesma migração.
- `src/pages/ForceChangePasswordPage.tsx`: mapear o erro `same_password` / mensagem "New password should be different from the old password" para o texto em português.
- Depois de aplicar, validar: troca de senha obrigatória conclui e redireciona, e o toggle Ativo/Inativo em Administração volta a funcionar para Gestor e Moderador.
