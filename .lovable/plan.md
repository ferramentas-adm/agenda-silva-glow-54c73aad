# Marca "Em call" com atualização manual

## Objetivo

Dar ao time de SDRs um sinal claro de que a reunião entre lead e closer está acontecendo naquele momento. Sem depender de eventos do Google: quem está na call (o closer) — ou um gestor — marca manualmente, e a marca aparece na hora para todo mundo no calendário e na listagem de reuniões.

## Como funciona

1. No card de detalhes da reunião e na linha da listagem existe um botão **"Iniciar call"**.
2. Ao clicar, a reunião fica marcada como **Em call**: badge vermelha pulsante no bloco do calendário, na listagem e no card.
3. O botão vira **"Encerrar call"**. Ao clicar, a marca sai.
4. A marca também sai sozinha quando a reunião recebe um resultado (realizada, no-show, cancelada) ou quando passa muito tempo do fim previsto (limpeza automática), para não ficar reunião "em call" esquecida da noite anterior.
5. Como a tela já recebe atualizações em tempo real, o SDR vê a marca acender sem precisar recarregar.

## Quem pode marcar

- O closer dono da reunião.
- Gestor, supervisor, moderador e apresentador (qualquer reunião).
- SDR e demais papéis apenas visualizam a marca.

## Implementação

### 1. Banco de dados

Migração em `agendamentos`:

- `em_call_desde timestamptz` — quando a call foi marcada como iniciada.
- `em_call_ate timestamptz` — quando foi encerrada.
- `em_call_por uuid` — quem marcou (para o histórico).

Índice parcial para as reuniões em call (consulta do filtro "Em call agora"). Nenhum campo existente é alterado; o enum `appointment_status` **não** muda, para não afetar métricas, webhooks, DataCrazy nem CAPI.

Políticas de atualização: reaproveitar as regras já existentes de `agendamentos` (closer dono + gestores), restritas a esses três campos novos.

### 2. Regra de "em call"

Uma reunião está em call quando `em_call_desde` está preenchido e `em_call_ate` está vazio. A limpeza automática (fim previsto + 2 horas) roda por rotina agendada e preenche `em_call_ate`, marcando no histórico que foi encerramento automático.

### 3. Interface

- **Calendário**: badge "EM CALL" vermelha pulsante no bloco da reunião; botão Iniciar/Encerrar call no card de detalhes, logo abaixo dos dados principais.
- **Listagem de reuniões**: mesma badge na linha e o botão na área de ações.
- **Filtro rápido "Em call agora"** no topo do calendário e da listagem.
- Tooltip/legenda mostra desde que horário está em call, no horário de Brasília.

### 4. Histórico

Cada início e encerramento manual é registrado no histórico de atividades (`/audit-logs`) com ação `em_call_iniciada` / `em_call_encerrada`, o nome de quem marcou e a hora.

## Escopo preservado

- Nada é enviado ao lead, ao DataCrazy, ao Meta CAPI ou às automações de lembrete.
- Nenhuma alteração em `/silva-agendar`, `/silva-reunioes`, `/silva-vendas`, disponibilidade, turmas, overbooking ou Google Calendar/Meet.
- Timezone America/Sao_Paulo em toda exibição; timestamps gravados em UTC.

## Validação

- Marcar e desmarcar uma reunião de teste e conferir a badge no calendário e na listagem, em duas abas (tempo real).
- Conferir que closer não-dono e SDR não veem o botão.
- Conferir os dois registros no histórico de atividades.
- Conferir que dar resultado à reunião encerra a marca.
- Build e verificação de compilação.

## Nota

Se mais adiante você quiser a detecção automática (Google Meet avisando quando lead e closer estão juntos na sala), este desenho já fica pronto para isso: os mesmos campos `em_call_desde`/`em_call_ate` passariam a ser preenchidos pelo evento do Google, sem mexer na interface.
