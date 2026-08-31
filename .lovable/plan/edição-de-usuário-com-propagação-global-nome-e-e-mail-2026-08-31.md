# Edição de usuário com propagação global (nome e e-mail)

## Causa (confirmada)

O cadastro foi criado com `beatriz.santos@ogruposilva.com.br` e depois editado no painel para `beatrizsantos@ogruposilva.com.br`. A edição alterou apenas o perfil exibido no painel; a conta de autenticação continuou com o e-mail antigo (com ponto). Por isso o login com o e-mail sem ponto retorna "Invalid login credentials" — não importa quantas senhas temporárias sejam geradas.

Hoje a edição de usuário não propaga para a conta de autenticação nem para o cadastro de closers, então nome/e-mail podem ficar divergentes em três lugares.

## Correção

1. **Destravar a Beatriz agora**: alinhar a conta de autenticação ao e-mail atual do perfil (`beatrizsantos@...`), mantendo a conta confirmada, gerar nova senha temporária e validar o login de ponta a ponta (entrar → tela "Altere sua senha" → concluir).
2. **Edição global de usuário**: ao salvar nome e/ou e-mail no painel Administração, a alteração passa a ser aplicada em uma única operação para:
   - conta de autenticação (e-mail de login e nome nos metadados, já confirmado, sem exigir reconfirmação por e-mail);
   - perfil do usuário (nome e e-mail);
   - cadastro de closer vinculado, quando existir (nome e e-mail).
   Se qualquer etapa falhar, nada é aplicado pela metade: a operação retorna erro claro e o painel mostra a mensagem, sem deixar dados divergentes.
3. **Validações**: bloquear e-mail já usado por outro usuário, normalizar para minúsculas e sem espaços, e registrar a alteração nos logs de auditoria (valor antigo → novo).
4. **Varredura de divergências**: identificar todos os usuários cujo e-mail/nome de perfil difere da conta de autenticação e corrigir os casos encontrados com o mesmo tratamento; exibir aviso no painel quando houver divergência remanescente.

## Detalhes técnicos

- `supabase/functions/manage-user/index.ts`: nova ação `update_user` (restrita a Gestor; Moderador conforme as regras atuais) que chama `auth.admin.updateUserById` com `email`, `email_confirm: true` e `user_metadata.full_name`, e em seguida atualiza `profiles` e `closers` (match pelo e-mail antigo/`user_id`). Ordem: verificar duplicidade → atualizar auth → atualizar profiles → atualizar closers → auditar; em falha após o auth, reverter o e-mail no auth.
- `src/pages/AdminPage.tsx`: o diálogo de edição passa a invocar `update_user` em vez de gravar direto em `profiles`; invalidar as queries de usuários e closers após sucesso.
- Trigger/guard opcional: impedir `UPDATE` direto de `profiles.email` por clientes autenticados, forçando o caminho da função (evita reintrodução da divergência).
- Consulta de auditoria: `select p.user_id, p.email, u.email from profiles p join auth.users u on u.id = p.user_id where lower(p.email) <> lower(u.email)`.
