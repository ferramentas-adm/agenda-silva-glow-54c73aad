# Reagendado só vale dentro do dia da reunião antiga

Correção da regra atual: hoje o sistema decide o desfecho da reunião antiga pelo tempo restante (menos de 1h → exige No-show/Cancelada). A partir desta mudança, o critério passa a ser **a data da reunião antiga**, não os minutos restantes.

## Nova regra

Ao criar uma agenda para outro dia, quando o lead (mesmo telefone) já tem reunião em aberto ("Agendada" ou "Confirmada") nos últimos 7 dias:

| Situação da reunião antiga | O que acontece |
|---|---|
| Data da antiga é **hoje** (mesmo que o horário já tenha passado) | Antiga fica **Reagendada** na data original; a nova nasce **Agendada** e vinculada como reagendamento |
| Data da antiga é de **dias anteriores** | O usuário precisa escolher o desfecho: **No-show** ou **Cancelada** (com motivo). A nova nasce **Agendada** como agenda nova, sem vínculo |

Ou seja: depois que o dia da reunião termina, não é mais possível marcá-la como "Reagendada".

Casos de referência:
- Reunião hoje 20h, reagendo às 19h38 para amanhã → antiga "Reagendada", nova "Agendada".
- Reunião hoje 20h, agora 22h17, reagendo para data futura → antiga "Reagendada", nova "Agendada".
- Reunião ontem 20h, agora 09h30, reagendo para hoje ou depois → antiga "No-show" ou "Cancelada", nova "Agendada".

O que **não** muda:
- Mesmo dia, horário diferente → continua sendo troca de horário no próprio registro.
- Reunião antiga é hoje e faltam **60 min ou mais** → continua com exclusão automática da antiga (com aviso) e nova agenda criada, como já aprovado.
- Botão "Reagendar" no calendário → segue restrito a remanejo de horário no mesmo dia.

## Trava de exclusão perto do horário

Excluir uma reunião passa a ser permitido **somente quando faltam mais de 60 minutos** para o horário dela. Se faltar 60 minutos ou menos — ou o horário já tiver passado — a exclusão fica bloqueada para SDR e Closer, com aviso explicando que nesse caso a reunião deve ser encerrada como No-show, Cancelada ou Reagendada (quando ainda é o mesmo dia).

Gestor, Moderador e Supervisor continuam podendo excluir em qualquer horário.

## Detalhes técnicos


- `src/services/reagendamento.ts`: em `classifyConflict`, decidir pela data BRT (`brTodayYMD()` de `src/lib/timezone.ts`):
  - `newDate === prior.scheduled_date` → `same_day_time_change`;
  - `prior.scheduled_date < hoje` → `close_old` (exige `no_show` | `cancelada`);
  - `prior.scheduled_date === hoje` e faltam < 60 min ou já passou → novo modo `keep_as_reagendada`;
  - caso contrário → `delete_old`.
  Ajustar `conflictMessage` para os textos de cada modo e adicionar função para marcar a antiga como `reagendada` mantendo data/horário.
- `src/pages/AgendarPage.tsx`: no `AlertDialog`, exibir a seleção de desfecho (No-show / Cancelada + motivo via `useAppSettingList("cancellation_reasons")`) **apenas** no modo `close_old`; no modo `keep_as_reagendada` apenas confirmar. No `handleSubmit`, no modo `keep_as_reagendada` marcar a antiga como `reagendada` e gravar a nova com `original_agendamento_id` = antiga; no `close_old` manter `original_agendamento_id` nulo.
- Sem alterações de banco: os status e a coluna `cancellation_reason` já existem, e os gatilhos de auditoria/webhook cobrem esses casos.
