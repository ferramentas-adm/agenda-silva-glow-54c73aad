# Identificar Segunda Reunião no webhook DataCrazy

## Contexto

- Quando um closer (ou admin marcando como 2ª) cria um agendamento via `/agendar`, o registro é salvo com:
  - `meeting_reason = 'segunda_reuniao'`
  - `channel_type = 'Segunda Reunião'`
- Um novo evento + link do Google Meet é criado normalmente nesse fluxo (confirmado em `src/pages/AgendarPage.tsx`), portanto cada 2ª reunião já tem seu próprio `meet_link`.
- Porém o trigger `notify_status_change_webhook` (e o helper `src/services/datacrazyAgendamento.ts` usado em reenvios) **não envia** `meeting_reason` nem `channel_type`. A DataCrazy recebe a 2ª reunião como se fosse um agendamento normal e não tem como movimentar o pipeline.

## Mudança proposta

Acrescentar dois campos ao payload enviado à DataCrazy, em **todos** os eventos (INSERT, UPDATE de status e exclusão):

- `meeting_reason`: valor cru do banco (`"segunda_reuniao"` ou `null`)
- `is_segunda_reuniao`: boolean derivado (`meeting_reason = 'segunda_reuniao'`), para facilitar a regra no flow da DataCrazy
- `channel_type`: valor cru (`"Segunda Reunião"`, `"WhatsApp"`, etc., ou `null`)

Assim a DataCrazy pode usar `is_segunda_reuniao = true` como gatilho de movimentação de pipeline, sem depender de string matching.

## Onde alterar

### 1. Trigger SQL `notify_status_change_webhook` (migration)

No bloco `_payload := jsonb_build_object(...)` (tanto no caminho de exclusão quanto no caminho normal), adicionar:

```sql
'meeting_reason', COALESCE(NEW.meeting_reason, ''),
'is_segunda_reuniao', (NEW.meeting_reason = 'segunda_reuniao'),
'channel_type', COALESCE(NEW.channel_type, '')
```

### 2. `src/services/datacrazyAgendamento.ts`

- Incluir `meeting_reason` e `channel_type` no `select(...)` do `agendamentos`.
- Adicionar os mesmos três campos (`meeting_reason`, `is_segunda_reuniao`, `channel_type`) no objeto `payload`, para manter paridade com o trigger nos reenvios manuais (alteração de horário, reagendamento via UI).

## Não muda

- Lógica de criação do Meet link (já cria um novo por agendamento).
- Cálculo do `status` enviado (continua "Agendado"/"Reagendada"/etc.).
- Schema das tabelas — só leitura de colunas que já existem.

## Validação

- Após a migration, criar uma 2ª reunião de teste como closer e confirmar nos logs do webhook (`api.datacrazy.io`) que o payload chega com `is_segunda_reuniao: true` e `meeting_reason: "segunda_reuniao"`.
- Criar um agendamento normal de SDR e confirmar que vem `is_segunda_reuniao: false` e `meeting_reason: ""`.
