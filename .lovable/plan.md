# Padronizar payload do webhook DataCrazy

## Objetivo

Garantir que as **3 formas** de criar agendamento (toggle Admin, VendaDialog do Closer, Closer agendando direto no `/agendar`) — e também updates de status e deleções — disparem o webhook DataCrazy com **exatamente o mesmo conjunto de chaves**, preenchendo `null` (ou string vazia para strings) quando o dado não se aplicar.

## Situação atual

A função `notify_status_change_webhook` monta o payload condicionalmente:
- `closer_name` só é incluído se `closer_id IS NOT NULL`
- `meet_link` só é incluído se preenchido
- `calendar_link` só é incluído em não-deleções
- Bloco de enriquecimento (`lead_revenue`, `motivo_nao_fechamento`, `explicacao_nao_fechamento`, `valor_apresentado`, `recebimento_acordado`, `valor_previsto`, `data_prevista`) só é anexado em **INSERT de 2ª reunião com `original_agendamento_id`** → fica fora em Forma 1, Forma 3 (sem reagendamento), updates e deleções
- `deleted_at` e `deletion_reason` só existem em deleções

Resultado: cada cenário envia um subset diferente de chaves, dificultando o consumo no CRM.

## Mudança

Editar a função `public.notify_status_change_webhook` (migration) para sempre montar **um único payload base** com todas as chaves abaixo, usando `null` quando não houver valor:

**Chaves sempre presentes no payload:**
- `lead_name`, `lead_phone`
- `status`
- `scheduled_datetime`, `created_at`
- `sdr_name`, `closer_name`
- `briefing`, `meeting_reason`, `is_segunda_reuniao`, `channel_type`
- `meet_link`, `calendar_link`
- `deleted_at`, `deletion_reason`
- `lead_revenue`, `motivo_nao_fechamento`, `explicacao_nao_fechamento`, `valor_apresentado`
- `recebimento_acordado`, `valor_previsto`, `data_prevista`

Regras de preenchimento:
- Campos de venda/pagamento: continuam sendo buscados quando é INSERT de `segunda_reuniao` com `original_agendamento_id`; caso contrário viram `null`.
- `closer_name`: `null` quando não houver `closer_id`.
- `meet_link`: `null` quando vazio.
- `calendar_link`: sempre calculado (inclusive em deleções, baseado em `scheduled_date/time`).
- `deleted_at` / `deletion_reason`: `null` fora de deleção.
- `recebimento_acordado`: `false` quando não há pagamento; `null` apenas se a reunião não for 2ª reunião enriquecida — manteremos `false` como padrão para consistência booleana.

## Não muda

- Lógica de quando o webhook dispara (mesmas condições de status/INSERT/deleção).
- Frontend (`AgendarPage.tsx`, `VendaDialog.tsx`) — nenhuma alteração de UI ou regra de negócio.
- Edge functions.

## Validação

Após aplicar a migration, simular as 3 formas (similar ao teste já feito anteriormente):
1. Toggle Admin (Forma 1) — verificar payload no log do trigger / DataCrazy.
2. VendaDialog → "Sim, marcar segunda reunião" (Forma 2).
3. Closer cria reunião direto no `/agendar` (Forma 3).

Confirmar que as 3 chamadas trazem o mesmo conjunto de chaves, com `null` onde aplicável.
