# Alinhar 2ª reunião com fluxo de agendamento normal

Hoje, ao criar a segunda reunião pelo painel **Resultado da Reunião** (`VendaDialog.tsx`), o sistema apenas insere uma linha em `agendamentos` sem criar evento no Google Calendar do closer, sem gerar Meet link e sem `google_event_id`. O webhook do CRM dispara com `meet_link: NULL` e `calendar_link` genérico (template URL).

A meta é replicar exatamente o comportamento do `AgendarPage`: criar evento real no Google Calendar do closer, capturar o Meet link, salvar `meet_link` e `google_event_id` em `agendamentos`, e só então deixar o trigger do webhook disparar com os dados corretos.

## Mudanças

### `src/components/VendaDialog.tsx` (bloco da 2ª reunião, linhas ~363-387)

1. Antes do `supabase.from("agendamentos").insert(...)` da segunda reunião, chamar `createGoogleCalendarEvent` (já importado de `@/hooks/useGoogleCalendar`) com:
   - `closer_id`: `agData.closer_id`
   - `lead_name` / `lead_phone`: do `agData`
   - `sdr_name`: nome do SDR original (já recuperado em `sdrName`) — fallback para nome do usuário logado
   - `scheduled_date`: `format(followUpDate, "yyyy-MM-dd")`
   - `scheduled_time`: `followUpTime`
   - `duration_minutes`: 60 (padrão; herdar do agendamento original se disponível)

2. Tratar resultado igual ao `AgendarPage`:
   - sucesso → guardar `meetLink` e `eventId`
   - falha → logar warning, exibir `toast.warning` informativo, mas seguir criando o agendamento sem Meet

3. Incluir `meet_link` e `google_event_id` no `insert` da nova reunião.

4. Validação prévia: se o `closer_id` não tiver Google conectado (`closer_google_tokens`), o `google-create-event` já retorna erro tratável — apenas seguir sem Meet e avisar via toast.

### Ordem das operações (importante para o webhook)

Hoje:
```
insert pagamento → insert agendamento (trigger dispara webhook) → sendVendaToDataCrazy
```

Novo:
```
insert pagamento
  → createGoogleCalendarEvent (await)
    → insert agendamento com meet_link + google_event_id (trigger dispara webhook já com meet_link preenchido)
      → sendVendaToDataCrazy
```

O trigger `notify_status_change_webhook` já lê `NEW.meet_link` no payload, então nenhuma alteração no banco é necessária — basta o insert já vir com o valor correto.

### Observações

- Nenhuma migração de banco.
- Nenhuma alteração em edge function.
- Sem impacto no fluxo de SDR/AgendarPage (continua igual).
- Se a 2ª reunião for criada com closer sem Google conectado, comportamento degrada com graça (igual ao AgendarPage hoje).

## Arquivos afetados

- `src/components/VendaDialog.tsx` — único arquivo editado
