# Login da Beatriz Santos: e-mail de acesso diferente do e-mail exibido no painel

## Causa (confirmada)

A senha temporária foi aplicada com sucesso (a conta de autenticação foi atualizada hoje às 13:41 BRT). O problema não é a senha, é o **e-mail**:

- E-mail de login real (conta de autenticação): `beatriz.santos@ogruposilva.com.br` (com ponto)
- E-mail cadastrado no perfil, que aparece no painel Administração: `beatrizsantos@ogruposilva.com.br` (sem ponto)

Ela está digitando o endereço sem ponto (como no print), e o serviço de autenticação responde "Invalid login credentials" porque esse endereço não existe como conta. Qualquer nova senha temporária continuará falhando enquanto os dois e-mails estiverem diferentes.

Efeito colateral: o login com Google também falharia, porque a validação de acesso via Google procura o perfil pelo e-mail da conta Google.

## Correção

1. Padronizar os dois registros no mesmo endereço. Recomendação: usar `beatrizsantos@ogruposilva.com.br` (sem ponto, o que ela usa e o que o painel mostra) e atualizar o e-mail da conta de autenticação para esse valor, mantendo a conta confirmada.
   - Alternativa, se o endereço com ponto for o oficial da empresa: atualizar o perfil para `beatriz.santos@...` e avisá-la para entrar com o ponto.
2. Gerar uma nova senha temporária depois do ajuste e validar o login de ponta a ponta (entrar → tela "Altere sua senha" → concluir).
3. Prevenção: no painel Administração, exibir o e-mail real de login ao lado do e-mail do perfil quando os dois forem diferentes, com um aviso claro, para o gestor não redefinir senha achando que o endereço mostrado é o de acesso.
4. Verificação geral: listar todos os usuários cujo e-mail de perfil difere do e-mail da conta de autenticação e corrigir os casos encontrados (mesmo tratamento acima).

## Detalhes técnicos

- Atualização do e-mail de autenticação via função administrativa (`auth.admin.updateUserById` com `email` + `email_confirm: true`) — feita por uma ação nova no `supabase/functions/manage-user/index.ts` (ex.: `action: "sync_email"`), restrita a Gestor, com registro em `audit_logs`.
- Sincronizar `profiles.email` na mesma operação, garantindo que perfil e conta de autenticação nunca fiquem divergentes.
- Consulta de auditoria: `select p.email, u.email from profiles p join auth.users u on u.id = p.user_id where lower(p.email) <> lower(u.email)`.
- UI: em `src/pages/AdminPage.tsx`, badge/aviso "e-mail de login diferente" na linha do usuário e no diálogo de redefinição de senha.
