# SDR IA (João Amorim) — /silva-disponibilidade e /silva-agendar

## O que o código atual faz (verificado)

- **Etapa 2 ("N livres")** — `CloserSelector.tsx`: para cada closer ativo, conta os slots do horário comercial global (`app_settings.business_hours_start/end`, 1 em 1 hora) que não estão (a) ocupados por agendamento dele no dia (status diferente de `cancelada`/`reagendada`, `deleted_at` nulo), (b) cobertos por bloqueio pessoal (`closer_blocks` pontuais + recorrentes por dia da semana, menos `closer_block_exceptions` da data) nem (c) já passados (hoje, fuso São Paulo).
- **Lotação da hora** — `useSlotCounts.ts` + revalidação no `handleSubmit` do `AgendarPage.tsx`: `count` = closers distintos com agendamento no horário + agendamentos sem closer; `capacity` = closers ativos − closers bloqueados naquela hora; lotado quando `count >= capacity`.
- **Etapa 3/4 (criar)** — INSERT direto em `agendamentos` com `status='agendada'`, `lead_name`, `lead_phone`, `closer_id` (ou null), `scheduled_date`, `scheduled_time` (`HH:MM`), `duration_minutes=60`, `briefing`, `observation`, `channel_type` (rótulo "Origem do lead"), `booking_channel`, `created_by`, `sdr_responsavel_id`, `is_5k=false`, `meta_lead_id/fbp/fbc/...`. Antes do INSERT, se houver closer, chama `google-create-event` (Meet + gravação automática) e grava `meet_link`/`google_event_id`.
- **Fila "Aguardando atribuição"** — é simplesmente `closer_id IS NULL` com status `agendada/confirmada/nao_confirmada`; o trigger `notify_pending_closer_assignment` avisa gestores e o evento Google só é criado na atribuição.
- **Briefing** — é digitado pelo SDR no textarea da tela e salvo em `agendamentos.briefing`. Não existe leitura de comentário do DataCrazy para o briefing (o `datacrazy-proxy` só é usado para buscar leads pela tag "agendamento" e para ler o campo "Lead ID" GS-XXXX). A função nova gravará o texto recebido em `briefing`, que é exatamente onde a tela lê.
- **Schedule do CAPI e CRM** — disparados por triggers de banco no INSERT (`trg_meta_capi_schedule` → `notify_meta_capi('Schedule')`; `notify_crm_sync` → `datacrazy-crm-sync`, que resolve o nome do SDR por `created_by` → `profiles`). Um INSERT via service_role dispara os dois igual à tela. Nada disso será alterado.
- **Métricas/Ranking SDR** — `agendaMetrics.ts` conta como SDR quem tem `created_by` com papel `sdr` (ou `sdr_responsavel_id` preenchido). Logo o João precisa existir como usuário real com role `sdr`.

## Pré-requisitos (dados, sem código)

1. Criar o usuário **João Amorim** (`profiles` + `user_roles = sdr`, e-mail interno tipo `joao.amorim.ia@ogruposilva.com.br`, `available_for_scheduling=false`, sem login Google). O `created_by` e o `sdr_responsavel_id` dos agendamentos da IA apontam para ele — assim ele aparece em Métricas/Ranking SDRs e no `sdr_name` enviado ao CRM.
2. Adicionar **"SDR IA"** à lista "Canal do agendamento" em Administração (`app_settings.booking_channels`); a função grava `booking_channel='sdr-ia'` e o painel "Por canal do agendamento" passa a exibi-lo.
3. Secret novo: **`SDR_IA_API_KEY`** (única coisa nova; DataCrazy e Google já têm secrets no ambiente das funções).

## Mapeamento do body → colunas de `agendamentos`

| Campo do POST | Coluna |
|---|---|
| nome / lead_whatsapp | `lead_name` / `lead_phone` |
| inicio (ou slot_id) | `scheduled_date` + `scheduled_time` (HH:MM, São Paulo), `duration_minutes=60` |
| slot_id → closer | `closer_id` (null → fila de atribuição) |
| sdr | `created_by` e `sdr_responsavel_id` = user João Amorim (nome validado contra `profiles.full_name`) |
| origem ("sdr-ia") | `booking_channel` |
| canal ("Tráfego Pago") | `channel_type` |
| briefing | `briefing` |
| funil, decisor_presente | `observation` ("Funil: vsl-direta · Decisor presente: sim") + `sdr_conversas.dados` |
| crm_lead_id | nova coluna `agendamentos.crm_lead_id text` + busca do "Lead ID" GS-XXXX no CRM para preencher `meta_lead_id` (mesma rotina da tela, melhora o casamento do Schedule) |
| idempotency_key | nova coluna `agendamentos.idempotency_key text` com índice único parcial |
| status / is_5k / is_venda_avulsa | `agendada` / false / false (idênticos à tela) |

## Arquivos a criar

- `supabase/functions/_shared/disponibilidade.ts` — porte fiel da regra da tela (horário comercial, closers ativos, agendamentos do dia, bloqueios + exceções, lotação da hora, `agora + 45 min`), usado pelas duas funções.
- `supabase/functions/_shared/datacrazyLead.ts` — chamadas diretas à API do DataCrazy com os mesmos secrets (`DATACRAZY_API_URL/TOKEN`): listar tags, `POST /leads/{id}/tags` para "agendamento" se ainda não tiver, e leitura do "Lead ID" (mesma URL/field id do proxy). O `datacrazy-proxy` exige JWT de usuário logado, então não pode ser chamado de uma função service_role sem alterá-lo — por isso a lógica é replicada, sem tocar no proxy.
- `supabase/functions/silva-disponibilidade/index.ts` (GET) e `supabase/functions/silva-agendar/index.ts` (POST), ambos `verify_jwt=false`, header `x-api-key` = `SDR_IA_API_KEY`, CORS igual às funções `silva-*`.
- `supabase/functions/_shared/googleEvent.ts` — extração do miolo de `google-create-event` (token/refresh, criação do evento + Meet + gravação automática) para uma função compartilhada; `google-create-event` passa a chamá-la sem mudar comportamento. Necessário porque aquele endpoint exige JWT de usuário.
- Migração SQL: colunas `crm_lead_id` e `idempotency_key` em `agendamentos`; tabelas `sdr_conversas`, `sdr_exclusoes`, `sdr_config` (RLS ativado, sem policies e sem GRANT para anon/authenticated → só service_role), índices em `telefone`, `etapa`, `last_lead_message_at`; seed do `sdr_config` (`link_video`, `system_prompt`, `tools_json`, `tags_json`, `handoff_attendant_id`).

## GET /silva-disponibilidade

- Params `a_partir_de` (default agora), `ate` (default +3 dias), `limite` (default 6). Início mínimo = `max(a_partir_de, agora) + 45 min`, arredondado para a próxima hora cheia da grade.
- Para cada dia do intervalo: carrega closers ativos, agendamentos do dia, bloqueios efetivos, exceções. Um slot (hora, closer) é livre quando o closer não tem agendamento naquela hora, não está bloqueado, a hora está no horário comercial e a hora não está lotada globalmente (`count < capacity`).
- Ordenação: início crescente; empate → closer com menos agendamentos no dia. Resposta `{"gerado_em", "slots":[{"slot_id":"<ISO>|<closer_id>","inicio","label"}]}` sem nome do closer. Labels em pt-BR: "hoje às 17h", "amanhã (sábado) às 10h", "segunda (14/09) às 15h".

## POST /silva-agendar

Ordem de execução:
1. Validação Zod do body; telefone normalizado com 55.
2. `idempotency_key` já existe → 200 com o agendamento existente.
3. Telefone já tem agendamento futuro `agendada/confirmada` não excluído → 409 `ja_agendado` com o agendamento.
4. Revalida o slot com a mesma função de disponibilidade (closer livre e hora não lotada; sem `slot_id`, só a lotação da hora) → 409 `slot_indisponivel`.
5. Busca `meta_lead_id` via `crm_lead_id` (best effort) e aplica a tag "agendamento" no DataCrazy (best effort, não bloqueia).
6. Com closer: cria evento Google (`meet_link`, `google_event_id`); falha não impede o agendamento (igual à tela).
7. INSERT em `agendamentos` com o mapeamento acima → triggers disparam Schedule (CAPI), sync CRM, notificação da fila e auditoria.
8. Auditoria adicional `audit_logs` (`create_agendamento_sdr_ia`) e, se vier `crm_conversation_id`, upsert em `sdr_conversas` com `agendamento_id`.
9. 201 `{"agendamento_id","inicio","closer","link_reuniao","fila_atribuicao"}`.

## Garantias de equivalência com a tela

- Mesmas colunas, mesmos valores padrão, mesmo status inicial e mesmo caminho de triggers; `/silva-reunioes` lê `agendamentos` sem filtro de origem, então o registro aparece automaticamente.
- Teste de aceitação: criar um agendamento de teste pelas funções, conferir em `/silva-reunioes`, em `meta_capi_events` (evento Schedule), no calendário/fila e em Métricas SDRs; depois excluir com justificativa.
