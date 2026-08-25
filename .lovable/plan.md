# Encerrar a reunião antiga como No-show ou Cancelada

Hoje, quando o lead já tem reunião em aberto e o novo agendamento é para **outro dia** com menos de 1h restante (ou horário já passado), a reunião antiga fica como **Reagendada** e a nova nasce vinculada a ela. Isso mistura "remanejo de horário" com "o lead não compareceu / cancelou".

## Nova regra

Se o novo agendamento é para um **dia diferente** (dia seguinte ou qualquer data futura) e falta menos de 1h para a reunião antiga (ou ela já passou):

- O aviso de confirmação passa a **exigir uma escolha**: encerrar a reunião antiga como **No-show** ou como **Cancelada**.
- Ao escolher **Cancelada**, o usuário informa o **motivo do cancelamento** (mesma lista já configurada em Administração > Listas).
- A reunião antiga é encerrada **no dia dela** (a data original não muda), com o status escolhido.
- A nova reunião nasce **como agenda nova**, sem vínculo com a antiga — ou seja, conta como nova produção do SDR, não como reagendamento.

O que **não** muda:

- Mesmo dia, horário diferente → continua sendo troca de horário no próprio registro.
- Faltam 60 min ou mais para a antiga → continua com exclusão automática da antiga (com aviso) e nova agenda criada.
- Botão "Reagendar" no calendário → continua restrito a remanejo de horário no mesmo dia.

## Detalhes técnicos

- `src/services/reagendamento.ts`: substituir o modo `keep_as_reagendada` por um modo `close_old` que exige desfecho (`no_show` | `cancelada`). Adicionar função para aplicar o desfecho na antiga (status + `cancellation_reason` quando cancelada), mantendo `scheduled_date`/`scheduled_time`. Ajustar `conflictMessage` para o novo texto.
- `src/pages/AgendarPage.tsx`: no `AlertDialog` de conflito, adicionar seleção de desfecho (No-show / Cancelada) e, quando Cancelada, o select de motivos via `useAppSettingList("cancellation_reasons")`; bloquear a confirmação até a escolha. No `handleSubmit`, aplicar o desfecho na antiga antes de inserir a nova e deixar `original_agendamento_id` como `null` nesse caso.
- Sem alterações de banco: os status `no_show`/`cancelada` e a coluna `cancellation_reason` já existem, e os gatilhos de auditoria/webhook de mudança de status já cobrem esses casos.
