## Objetivo

Quando gestor/moderador transferir um lead para outro closer (no detalhe do calendário ou na coluna "Closer" da Lista de Reuniões), também mover o evento no Google Calendar:

1. **Apagar** o evento na agenda Google do closer antigo.
2. **Criar** um novo evento na agenda Google do closer novo (com novo link do Meet).
3. **Atualizar** `meet_link` e o ID do evento Google no agendamento.

## Mudanças

### 1. Banco — guardar o ID do evento Google (migration)
- Adicionar coluna `google_event_id text` em `public.agendamentos` (nullable).
- Necessária para conseguir deletar o evento na agenda do closer antigo.
- Sem mudança em RLS.

### 2. Persistir o `event_id` ao criar reunião
- `src/pages/AgendarPage.tsx`: após `createGoogleCalendarEvent` retornar `event_id`, salvar em `agendamentos.google_event_id` junto com o `meet_link` (já é salvo). Vale para fluxo novo e reagendamento.

### 3. Nova edge function `google-transfer-event`
Arquivo: `supabase/functions/google-transfer-event/index.ts`

Entrada: `{ agendamento_id, new_closer_id }`. 

Fluxo:
1. Validar JWT do chamador (mesmo padrão das outras functions).
2. Buscar agendamento (closer antigo, data/hora, lead, `google_event_id`).
3. Buscar token Google do **novo closer**:
   - Se conectado: criar evento na agenda dele (reaproveita lógica de `google-create-event`, gerando novo Meet) → guardar `new_event_id` e `new_meet_link`.
   - Se não conectado: prosseguir sem criar (retorna aviso `new_closer_not_connected`).
4. Buscar token do **closer antigo** e tentar deletar o evento antigo (`DELETE /calendars/.../events/{event_id}`). Falhas são logadas mas não bloqueiam.
5. Atualizar `agendamentos`: `closer_id = new`, `meet_link = new_meet_link || null`, `google_event_id = new_event_id || null`. Operação feita com service role para garantir consistência.
6. Retornar `{ success, meet_link, warnings: [...] }`.

### 4. Frontend — usar a edge function nos dois pontos de transferência
- `src/pages/DashboardPage.tsx` (`handleTransferLead`): substituir o `update` direto pela chamada `supabase.functions.invoke("google-transfer-event", ...)`. Atualizar cache local com o novo `meet_link`. Manter `logAudit("transfer_lead", ...)`.
- `src/pages/ReunioesListPage.tsx` (`handleTransferCloser`): mesma substituição. Mostrar `toast.warning` quando vier `new_closer_not_connected`.

### 5. Tratamento de bordas
- Agendamentos antigos sem `google_event_id`: a function pula o delete (apenas cria o novo se possível).
- Status já finalizados (`realizada`, `cancelada`, `no_show`, `reagendada`): continuam transferíveis no banco, mas a function pula a parte do Google (não faz sentido criar/deletar evento de algo já encerrado). Retorna aviso.
- Erros do Google são logados via `console.error` e não revertem a transferência no banco — toast informa o usuário.

### 6. Auditoria
Adicionar nos detalhes do `transfer_lead` os campos `meet_link_old`, `meet_link_new` e `google_warnings` (se houver), para rastreio.

## Não está no escopo
- Notificar o lead sobre o novo link.
- Atualizar evento no DataCrazy (já sincronizado por triggers existentes).
- Mexer em transferências feitas por closers (regra atual mantida).
