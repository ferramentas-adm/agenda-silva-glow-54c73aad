# Reuniões voltam para "Aguardando atribuição" quando o Closer sai

## Objetivo

Nenhum lead pode ficar em limbo: se um Closer é inativado (ou excluído), todas as reuniões futuras dele que ainda não aconteceram voltam automaticamente para o módulo "Aguardando atribuição".

## Regra

Quando o registro de closer passa de ativo para inativo (por inativação do usuário, troca de função ou exclusão), o sistema:

- Seleciona as reuniões desse closer que ainda não foram realizadas: data de hoje em diante, status "agendada", "confirmada", "não confirmada" ou "pendente", não canceladas e não excluídas.
- Remove o closer da reunião e devolve o status para pendente/agendada, fazendo a reunião reaparecer em "Aguardando atribuição".
- Dispara a notificação de "Reunião aguardando atribuição" para gestor/moderador/supervisor, igual a um agendamento novo sem closer.
- Registra o motivo no histórico (log de auditoria) como devolução automática por inativação do closer.

Reuniões passadas, realizadas, canceladas ou de segunda reunião não são tocadas — o histórico do closer permanece intacto.

## Detalhes técnicos

1. Migração no banco:
   - Função `public.reassign_agendamentos_on_closer_deactivation()` + trigger `AFTER UPDATE OF active ON public.closers` (quando `active` vai de `true` para `false`) que faz o `UPDATE` em `public.agendamentos` limpando `closer_id` e normalizando o status para `pendente`/`agendada` nas reuniões futuras não realizadas.
   - Mesma função aplicada em trigger `BEFORE DELETE ON public.closers`, garantindo o ajuste de status (hoje a FK só zera `closer_id`, deixando a reunião com status "confirmada").
   - Inserção em `public.audit_logs` descrevendo a devolução (ação `closer_deactivated_unassign`).
   - A função é `SECURITY DEFINER` com `search_path = public`, para funcionar tanto via app quanto via edge function.

2. Edge function `manage-user`:
   - Na ação `toggle_active`, ao desativar o usuário, também marcar o registro correspondente em `public.closers` como `active = false` (hoje isso não acontece), o que aciona a nova trigger.
   - Ao reativar, o registro de closer só é reativado se a função do usuário for `closer` ou `available_for_scheduling` estiver ligado (comportamento atual preservado).

3. Nenhuma mudança de UI é necessária: o módulo "Aguardando atribuição" já lista reuniões futuras sem closer.

## Limpeza dos casos já ocorridos

A mesma migração roda uma correção pontual (uma vez): reuniões futuras não realizadas atribuídas a closers hoje inativos são devolvidas para "Aguardando atribuição", recuperando os leads que ficaram perdidos.
