# Indicador "Em call" com eventos reais do Google Meet

## Objetivo

Sinalizar ao time de SDRs, em tempo real, quando a reunião entre lead e closer está de fato acontecendo: badge vermelha pulsante **"Em call"** no bloco do calendário e na listagem de reuniões, com filtro rápido. A detecção usa **eventos reais do Google Meet** (Google Workspace Events API) e só liga quando **as duas partes estão juntas na sala** — closer e lead, não apenas o closer esperando.


## Como funciona a conexão com o Google

- O Google Meet **não** tem webhook simples. O caminho oficial é a **Google Workspace Events API**: criamos uma *subscription* sobre a sala (space) do Meet da reunião e o Google publica eventos (`conferenceStarted`, `participantJoined`, `participantLeft`, `conferenceEnded`) num tópico **Pub/Sub**, que entrega via push num endpoint nosso.
- É uma conexão **híbrida**: API (para criar/renovar assinaturas) + webhook (Pub/Sub push → nossa edge function).
- As subscriptions do Google **expiram** (dias). Uma rotina agendada renova automaticamente.
- O escopo OAuth `meetings.space.created`, já concedido pelos closers no piloto de gravação automática, é suficiente para assinar eventos da sala. Closers sem esse escopo ficam fora da detecção real (fallback abaixo).

## Implementação

### 1. Infraestrutura no Google Cloud (manual, guiada)

No mesmo projeto GCP do OAuth (GOOGLE_CLIENT_ID):

- Ativar **Google Workspace Events API** e **Pub/Sub API**.
- Criar o tópico Pub/Sub (ex.: `meet-events`) e dar permissão de publicação ao service account do Meet (`meet-api-event-push@system.gserviceaccount.com`).
- Criar assinatura push apontando para a URL da nova edge function `google-meet-events`.

### 2. Banco de dados

- Migração em `agendamentos`: `meet_space_name text` (nome do recurso `spaces/...`, necessário para assinar eventos) e `em_call_desde timestamptz` / `em_call_ate timestamptz` (janela real detectada).
- Tabela `meet_event_subscriptions`: `agendamento_id`, `subscription_name`, `space_name`, `expire_time`, `status` — para renovação.
- Realtime já existente em `agendamentos` atualiza a tela sem refresh.

### 3. Captura do nome da sala

- `google-create-event` passa a gravar o `space.name` retornado pela Meet API v2 (piloto de gravação já cria a sala via API). Para eventos criados só pelo Calendar (conferenceData), extrair o código do Meet do link e resolver o space via `spaces/{code}` — se a API permitir com o escopo atual; senão, essas reuniões ficam no fallback por horário.

### 4. Edge functions

- `meet-subscriptions-manager` (agendada, a cada hora): cria a subscription para reuniões de hoje/amanhã que tenham `meet_space_name` e renova as que expiram em menos de 24h.
- `google-meet-events` (webhook push do Pub/Sub, `verify_jwt=false`, token próprio de verificação): recebe os eventos, decodifica e mantém, por reunião, a lista de participantes presentes.

**Regra de "Em call" (as duas partes juntas):**

- `participantJoined` / `participantLeft` atualizam a contagem de presentes e classificam cada participante:
  - **closer** = participante identificado (`signedinUser`) cujo e-mail Google é o do closer da reunião;
  - **lead** = qualquer outro participante (convidado anônimo/`anonymousUser` ou e-mail diferente).
- `em_call_desde` só é gravado quando existe **ao menos um closer identificado E ao menos um outro participante** na sala ao mesmo tempo.
- `em_call_ate` é gravado quando essa condição deixa de valer (o closer sai, o lead sai, ou `conferenceEnded`).
- Se o lead entrar antes do closer, a badge só acende quando o closer entrar — e vice-versa. Closer sozinho na sala **não** conta como "Em call".
- Estado de presença guardado em `meet_presenca` (`agendamento_id`, `participant_key`, `tipo`, `entrou_em`, `saiu_em`) para tornar o processamento idempotente e auditável.
- Resposta 200 rápida ao Pub/Sub (ack); eventos duplicados (mesmo `eventId`) são ignorados.

### 5. Interface

- **Calendário**: badge vermelha pulsante "Em call" no bloco da reunião enquanto `em_call_desde` estiver preenchido e `em_call_ate` vazio.
- **Listagem de reuniões**: mesma badge na linha.
- **Filtro rápido** "Em call agora" no topo do calendário e da listagem.
- Tooltip mostra desde que horário a call está rolando (horário de Brasília).
- Todos que veem o calendário veem a badge, SDRs inclusos.

### 6. Fallback e limites declarados

- Reunião cujo closer não tem escopo/space gerenciável: sem eventos reais, sem badge (não inventamos "Em call" pelo horário, para não dar sinal falso ao SDR).
- Se o closer entrar por uma conta Google diferente da cadastrada, ele será classificado como "outro participante"; nesse caso a badge só acende com dois presentes, o que ainda representa uma call real.
- Eventos chegam com poucos segundos de atraso (Pub/Sub) — aceitável.
- Nada é enviado ao lead, ao DataCrazy ou ao Meta; nenhum lembrete é afetado.


## Validação

- Criar reunião de teste com a closer piloto (Meet via API), abrir a sala com 2 abas, conferir `em_call_desde` gravado e badge aparecendo no calendário sem refresh.
- Sair da sala e conferir `em_call_ate` e sumiço da badge.
- Testar renovação da subscription e idempotência (mesmo evento duplicado não altera nada).
- Build + git diff --check.

## Detalhes técnicos

- Workspace Events API: `POST https://workspaceevents.googleapis.com/v1/subscriptions` com `targetResource=//meet.googleapis.com/spaces/{space}`, `eventTypes` de conference/participant, `notificationEndpoint.pubsubTopic`.
- Renovação: `PATCH subscriptions/{name}` (updateMask `ttl`).
- Pub/Sub push: verificação por token no path/query; payload base64 em `message.data` com `ce-type` do evento.
- Timezone America/Sao_Paulo em qualquer exibição; timestamps gravados em UTC.
- Não altera `/silva-reunioes`, `/silva-vendas`, CAPI, DataCrazy nem validações de agendamento.

## Pré-requisito fora do app (você)

A etapa 1 (ativar APIs, criar tópico Pub/Sub e permissões) acontece no console do Google Cloud do mesmo projeto do OAuth. Eu te guio passo a passo na hora — é coisa de 10 minutos, sem custo relevante no volume de reuniões do painel.
