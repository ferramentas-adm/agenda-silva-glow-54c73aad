# Agendamento sem Closer + Fila de Atribuição

## Objetivo
SDRs deixam de escolher Closer ao agendar. O agendamento é criado "sem closer" e fica numa fila para a Head de SDR (gestor/moderador) revisar e atribuir o Closer. Integrações (DataCrazy / Google Calendar) só disparam após a atribuição.

## Mudanças no fluxo de Agendar (`AgendarPage` + `TimeSlotPicker`)

- Remover `CloserSelector` da página para SDR.
- Regras por papel:
  - **SDR**: nunca escolhe closer. Cria sempre com `closer_id = null`.
  - **Gestor / Moderador**: continua podendo escolher closer no ato (opcional). Se não escolherem, também cai na fila.
  - **Closer**: não usa mais "Agendar" para 1ª reunião. 2ª reunião continua só via Follow-up ou página de Resultado da Reunião (resultado = "não vendeu"). Sem alterações nesses fluxos.
- `TimeSlotPicker` em **modo global**: união dos horários em que pelo menos 1 closer ativo está livre na data (respeitando `closer_blocks`, agendamentos vigentes e horas passadas em America/Sao_Paulo). Não exibe nome de closer.

### Validação de capacidade no submit (limite por horário)

- Usar o **limite por horário definido no Admin** (já existente — `useSlotLimit` / `app_settings`, conforme o print).
- Regra:
  - Contar agendamentos ativos (não excluídos, status `agendada|confirmada|reagendada`) no slot `(scheduled_date, scheduled_time)`.
  - Se `count >= limite`:
    - **SDR**: bloqueia submit com mensagem "Limite de X agendas atingido nesse horário."
    - **Gestor / Moderador**: permite forçar (mantém comportamento atual).
- Aplicar a mesma checagem em duas camadas:
  1. UI: desabilitar slots cheios no `TimeSlotPicker` para SDR (já existe via `useSlotCounts` + `useSlotLimit` — confirmar e reaproveitar).
  2. Submit: recontar imediatamente antes do INSERT (anti-corrida) e abortar se estourou.

## Nova área "Aguardando atribuição"

- Novo item no menu lateral (`AppSidebar`) **Aguardando atribuição**, visível só para `gestor` e `moderador`, com badge de contagem.
- Rota `/aguardando-atribuicao` lista agendamentos com `closer_id IS NULL` e `deleted_at IS NULL`, ordenados por `scheduled_date`/`scheduled_time`.
- Cada linha mostra: lead, telefone, data/hora, canal, SDR responsável, briefing resumido, seletor de Closer + botão **Atribuir**.
  - Seletor mostra apenas closers ativos com slot livre no horário (mesma lógica do `CloserSelector`).
  - Atribuir = `UPDATE agendamentos SET closer_id = ?` — gatilho dos webhooks/Calendar (ver abaixo).

## Integrações: só após atribuição

- **Google Calendar**: `google-create-event` passa a ser chamado no momento da atribuição (página nova), não mais no submit do SDR.
- **DataCrazy webhook** (`notify_status_change_webhook`): adicionar guarda no início — `IF NEW.closer_id IS NULL THEN RETURN NEW; END IF;` para INSERT e para mudanças de status. Detectar `OLD.closer_id IS NULL AND NEW.closer_id IS NOT NULL` e disparar como "Agendado" (ou "Reagendada" se houver `original_agendamento_id`).

## Banco / regras

- `closer_id` já é `NULL`-permitido. Sem alteração de schema.
- RLS de `agendamentos`: confirmar que SDR consegue inserir com `closer_id = null`; ajustar policy se hoje exigir closer.
- Migration: ajustes em `notify_status_change_webhook`, `notify_status_change`, RLS (se necessário) e seed de nova permissão `assign_closer` (gestor + moderador).
- Notificação "Novo agendamento aguardando atribuição" → insert em `notifications` para gestor/moderador quando INSERT vem com `closer_id IS NULL`.

## Detalhes técnicos

- Reaproveitar `useSlotCounts`, `useSlotLimit` e `CloserSelector` na nova página.
- Nova chave em `usePermissions`: `assign_closer` controla acesso à rota.
- A criação de evento no Calendar migra do `AgendarPage` para a página de atribuição.

## Arquivos a tocar
- `src/pages/AgendarPage.tsx` — remover seleção de closer p/ SDR, ajustar payload, recontagem anti-corrida no submit.
- `src/components/agendar/TimeSlotPicker.tsx` — modo global (sem closer), desabilitar slots cheios via limite do Admin.
- `src/components/AppLayout.tsx` (sidebar) — novo item de menu com badge.
- `src/pages/AguardandoAtribuicaoPage.tsx` (novo) + rota em `src/App.tsx`.
- `src/hooks/usePermissions.ts` — chave `assign_closer`.
- Migration: trigger webhook, notificação, RLS, permissão.

## Fora de escopo
- Atribuição em massa / round-robin automático.
- Mudanças no fluxo de 2ª reunião (Follow-up / Resultado da Reunião).
