# Evento Schedule no Meta CAPI

## Situação atual (verificada)

Hoje só existem dois eventos disparados pelo sistema:

- `ReuniaoRealizada` — 61 enviados (último hoje 12:57 BRT)
- `Purchase` — 6 enviados (último hoje 12:55 BRT)

O gatilho de banco só reage a `status = 'realizada'`, e a função de envio aceita apenas `ReuniaoRealizada` e `Purchase`. Nenhum evento é enviado na criação da agenda.

## O que será feito

1. Usar o evento padrão do Meta **`Schedule`** na criação da agenda, com o mesmo payload de identidade (lead_id, telefone, e-mail, nome, estado, fbp/fbc, IP, user agent) e `event_id` estável `agendado-<id do agendamento>` para desduplicação no Meta.
2. Criar gatilho no banco que dispara `Schedule` uma única vez, na criação do agendamento (INSERT com `deleted_at` nulo), incluindo os criados como "Aguardando atribuição".
3. Reagendamento não gera novo `Schedule` (event_id é por agendamento).
4. Sem backfill dos agendamentos antigos — só dispara dos novos. Se quiser backfill, faço em um passo separado.

## Detalhes técnicos

- `supabase/functions/meta-capi-forward/index.ts`: adicionar `"Schedule"` ao tipo de `event_name` e ao cálculo de `eventId`.
- Migração: nova função `trg_meta_capi_schedule()` (`security definer`, `search_path = public`) chamando `public.notify_meta_capi('Schedule', NEW.id, NULL)` em AFTER INSERT em `public.agendamentos`.
- Auditoria continua em `public.meta_capi_events` (status pending/sent/failed).
