# Revisão de permissões: Admin vs Moderador e correção do Pedro Vieira

## Diferença entre Administrador (Gestor) e Moderador

Ambos veem e operam tudo do dia a dia (calendário, reuniões, follow-ups, pagamentos, dashboards, atribuir closer, editar horário, lançar venda). A diferença está no poder sobre a estrutura do sistema:

| Recurso | Gestor (Admin) | Moderador |
| --- | --- | --- |
| Criar/editar usuários e trocar funções | Sim (inclusive criar outro Gestor) | Sim, exceto mexer em Gestores |
| Ativar/inativar usuário | Sim (qualquer conta) | Sim, exceto contas de Moderador e Administrador |
| Matriz de permissões por função | Sim | Não |
| Listas e configurações gerais (motivos, horários, webhooks) | Sim | Sim |
| Gerenciar closers (cadastro, horários, gravação) | Sim | Parcial (horários sim; cadastro/exclusão só Gestor) |
| Excluir reuniões, vendas e pagamentos | Sim | Sim |
| Limpeza de logs antigos | Sim | Não |

Resumo: Moderador = operação completa + gestão de usuários comuns (incluindo ativar/inativar quem não é Moderador nem Administrador). Gestor = tudo isso + controle de acesso (funções, permissões, ativar/inativar qualquer conta) e cadastro de closers.

## O que está acontecendo com o Pedro Vieira

Hoje ele está como **Supervisor** (conta ativa, sem senha pendente). O papel Supervisor foi desenhado para ser "quase gestor" na tela, mas está inconsistente:

- Na matriz de permissões: sem Admin, sem Logs, sem Dashboard de Formulário.
- No banco, o papel Supervisor não é reconhecido em várias regras, então ações aparecem na tela e falham ao salvar:
  - Tarefas (Follow-ups): não consegue ver, criar, editar nem concluir tarefas — mas a permissão "Gerenciar Tarefas" está ligada para ele.
  - Bloqueios/compromissos em massa de closers: não consegue criar nem remover.
  - Configurações gerais / listas: sem acesso de escrita.
  - Revisão de erro de closer: pode atualizar, mas não pode criar o registro.

Isso explica a sensação de "não consigo fazer nada": ele entra (vários logins hoje, nenhuma outra ação registrada) e as ações que tenta ou não aparecem ou dão erro.

## O que será feito

1. Trocar o papel do Pedro Vieira para **Moderador**, que tem tudo funcionando ponta a ponta (tela + banco).
2. Corrigir as lacunas do papel **Supervisor** no banco, porque Ellen Morales também é Supervisora e sofre os mesmos bloqueios:
   - Tarefas: incluir Supervisor nas regras de ver, criar, editar e excluir.
   - Bloqueios de agenda de closers: permitir criar e remover para Gestor, Moderador e Supervisor (mantendo a nova regra de não bloquear horário com reunião agendada apenas para closer).
   - Configurações/listas: incluir Supervisor.
   - Revisão de erro de closer: permitir criação por Supervisor (já podia atualizar).
3. Alinhar a matriz de permissões do Supervisor com o que ele realmente pode fazer (manter Admin e Logs desligados, para não prometer telas que ele não deve gerenciar).
4. **Nova regra de ativação/inativação:** Moderador passa a poder ativar e inativar usuários, **exceto** contas que tenham função de Moderador ou de Administrador (Gestor) — essas continuam restritas ao Administrador. Um Moderador também não pode inativar a própria conta. A tela de Usuários passa a mostrar o botão de status para o Moderador, desabilitado com explicação quando a conta alvo for protegida, e toda mudança continua registrada nos logs de auditoria com quem fez.
5. Verificação final: revisar cada permissão da matriz de Gestor, Moderador, Supervisor e Apresentador contra as regras do banco e reportar qualquer divergência restante.

## Detalhes técnicos

- Migração para recriar as políticas de `tasks` (SELECT/INSERT/UPDATE/DELETE), `closer_blocks` (INSERT/DELETE), `app_settings` (ALL) e `closer_error_reviews` (INSERT) usando `public.is_manager()` (gestor + moderador + supervisor) em vez de listas fixas de `has_role`.
- Ativação/inativação: atualizar `public.guard_profile_active_change()` para aceitar `is_gestor()` OU (`has_role(auth.uid(),'moderador')` E o alvo `NEW.user_id` não possuir `gestor`/`moderador` em `user_roles` E `NEW.user_id <> auth.uid()`), mantendo o `INSERT` em `audit_logs`. Ampliar a policy `Gestors can update profiles` (`profiles` UPDATE) para incluir moderador com a mesma restrição, e ajustar a edge function `manage-user` para autorizar moderador nessa ação com a mesma checagem no servidor.
- Frontend: `src/pages/AdminPage.tsx` e `src/hooks/usePermissions.ts` — liberar o controle de status para moderador e desabilitar/explicar quando o alvo for gestor ou moderador.
- `role_permissions`: sem mudança de esquema; apenas conferência dos valores por papel.
- Troca de papel do Pedro via painel Administração (ou atualização direta em `user_roles`), mantendo o registro em `audit_logs`.
