# Reagendamento no mesmo dia: alterar horário em vez de duplicar

## Problema

Hoje existem dois caminhos que criam um **novo** agendamento ao reagendar:

- Página "Novo Agendamento" em modo edição/reagendamento (`AgendarPage`) — insere um novo registro com `original_agendamento_id` e marca o original como `reagendada`.
- Botão "Reagendar" no calendário (`DashboardPage`) — insere um novo registro com `original_agendamento_id`, sem closer.

Quando a nova data é o **mesmo dia** do agendamento original, isso gera dois registros do mesmo lead no mesmo dia (um `reagendada` + um novo em "Aguardando atribuição"). Ao o Gestor aprovar em "Aguardando Atribuição", a agenda aparece duplicada.

Já existe o comportamento correto em outro ponto: a edição de horário dentro do detalhe do calendário (`handleEditSave`) apenas atualiza `scheduled_time` e zera o `closer_id`, sem criar registro novo.

## Regra desejada

- **Mesma data** → é apenas troca de horário: atualiza o próprio agendamento (não cria novo, não marca `reagendada`, não conta como reagendamento nas métricas).
- **Data diferente** → mantém o comportamento atual: cria novo agendamento com `original_agendamento_id` e marca o original como `reagendada`.

## Mudanças

1. `src/pages/DashboardPage.tsx` — `handleReschedule`:
   - Se a data escolhida for igual a `detailAg.scheduled_date`:
     - Se o horário também for igual, apenas fecha o dialog (sem alteração).
     - Caso contrário, faz `update` no registro existente: novo `scheduled_time`, `closer_id = null`, `status = "agendada"` (volta para Aguardando atribuição), limpando `meet_link`/`google_event_id` como já ocorre quando o closer é removido.
   - Se a data for diferente: mantém o `insert` atual com `original_agendamento_id`.
   - Mensagem de sucesso diferenciada ("Horário alterado..." vs "Reagendamento criado...").

2. `src/pages/AgendarPage.tsx` — submit com `editId`:
   - Carrega/compara a data do agendamento original com `dateStr`.
   - Data igual → `update` do registro original (horário, closer, duração, briefing/observação, `is_5k`, canal), sem inserir novo registro e sem marcar `reagendada`; auditoria registrada como alteração de horário (`update`/`reschedule_same_day`) em vez de `reschedule_agendamento`.
   - Data diferente → fluxo atual inalterado (insert + original vira `reagendada`).

3. Invalidação de cache já existente é reaproveitada (`agendamentos`, `pending-assignments`, `reunioes-list`, `booked-slots`, `slot-counts`).

## Notas técnicas

- Comparação de datas feita por string `YYYY-MM-DD` (sem `new Date`), respeitando a regra de timezone do projeto.
- Webhook do CRM: no caminho de mesmo dia não há novo registro nem status `reagendada`, então o lead não recebe evento "Reagendada"; o envio ocorre como "Agendado/Confirmado" quando o Gestor atribuir o closer, igual à edição de horário já existente.
- Nenhuma migração de banco necessária; registros duplicados já criados no passado não são alterados por esta mudança.
