# Evento Scheduled no Meta CAPI

## Situação atual (verificada)

Nenhum evento `Scheduled` foi disparado — ele nunca foi implementado. Hoje só existem dois eventos:

- `ReuniaoRealizada` — 61 enviados (último hoje 12:57 BRT)
- `Purchase` — 6 enviados (último hoje 12:55 BRT)

O gatilho de banco só reage a `status = 'realizada'`, e a função de envio aceita apenas `ReuniaoRealizada` e `Purchase`.

## O que será feito

1. Aceitar `Scheduled` na função de envio (mesmo payload de identidade: lead_id, telefone, e-mail, nome, estado, fbp/fbc, IP, user agent), com `event_id` estável `agendado-<id do agendamento>` para desduplicação no Meta.
2. Criar gatilho no banco que dispara `Scheduled` uma única vez, na criação do agendamento (INSERT com `deleted_at` nulo), incluindo os criados como "Aguardando atribuição".
3. Reagendamento não gera novo `Scheduled` (o event_id é por agendamento; reagendamento no mesmo registro não redispara).
4. Sem backfill dos agendamentos antigos — só dispara dos novos a partir da publicação. Se quiser backfill, faço em um passo separado.

## Detalhes técnicos

- `supabase/functions/meta-capi-forward/index.ts`: adicionar `"Scheduled"` ao tipo de `event_name` e ao cálculo de `eventId`.
- Migração: nova função `trg_meta_capi_scheduled()` (`security definer`, `search_path = public`) chamando `public.notify_meta_capi('Scheduled', NEW.id, NULL)` em AFTER INSERT em `public.agendamentos`.
- Auditoria continua em `public.meta_capi_events` (status pending/sent/failed).
