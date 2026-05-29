# Enviar webhook de teste "Segunda Reunião" para a DataCrazy

Disparar um POST direto para o webhook da DataCrazy via `net.http_post` no banco, com payload idêntico ao que o trigger `notify_status_change_webhook` gera para uma 2ª reunião no INSERT. Não cria registro em `agendamentos`, é só o webhook.

## Payload que será enviado

```json
{
  "lead_name": "Lead Teste Mapeamento",
  "lead_phone": "+55 (11) 99999-0001",
  "status": "Agendado",
  "scheduled_datetime": "2026-06-02T15:00:00Z",
  "created_at": "2026-05-29T18:40:00Z",
  "sdr_name": "SDR Original (Teste)",
  "closer_name": "Closer Atual (Teste)",
  "briefing": "Cliente quer entender as opções de planos. Já recebeu proposta na 1ª reunião.",
  "meeting_reason": "segunda_reuniao",
  "is_segunda_reuniao": true,
  "channel_type": "Segunda Reunião",
  "meet_link": "https://meet.google.com/abc-defg-hij",
  "calendar_link": "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Grupo+Silva+%26+Lead+Teste+Mapeamento&dates=20260602T150000/20260602T160000&ctz=America/Sao_Paulo"
}
```

## Como será executado

Comando único no banco:
```sql
SELECT net.http_post(
  url := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6',
  body := '<payload acima>'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json')
);
```

Após executar, dá pra conferir no fluxo da DataCrazy a chegada com todos os campos para mapeamento.
