# SDR IA (João Amorim) — /silva-disponibilidade e /silva-agendar (piloto: sempre na fila)

## O que o código atual faz (verificado)

- **Etapa 2 ("N livres")** — `CloserSelector.tsx`: para cada closer ativo, conta os slots do horário comercial global (`app_settings.business_hours_start/end`, 1 em 1 hora) que não estão ocupados por agendamento dele no dia (status diferente de `cancelada`/`reagendada`, `deleted_at` nulo), nem cobertos por bloqueio pessoal (`closer_blocks` pontuais + recorrentes, menos `closer_block_exceptions` da data), nem já passados (fuso São Paulo).
- **Lotação da hora** — `useSlotCounts.ts` + revalidação no `handleSubmit` do `AgendarPage.tsx`: `count` = closers distintos com agendamento no horário + agendamentos sem closer; `capacity` = closers ativos − closers bloqueados naquela hora; lotado quando `count >= capacity`.
- **Etapa 3/4 (criar)** — INSERT em `agendamentos` com `status='agendada'`, `lead_name`, `lead_phone`, `closer_id` (ou null), `scheduled_date`, `scheduled_time` (`HH:MM`), `duration_minutes=60`, `briefing`, `observation`, `channel_type` (rótulo "Origem do lead"), `booking_channel`, `created_by`, `sdr_responsavel_id`, `is_5k=false`, `meta_lead_id/fbp/fbc/...`.
- **Fila "Aguardando atribuição"** — `closer_id IS NULL` com status `agendada/confirmada/nao_confirmada`; o trigger `notify_pending_closer_assignment` avisa gestores e o evento Google/Meet só é criado na atribuição.
- **Briefing** — digitado pelo SDR na tela e salvo em `agendamentos.briefing`. Não há leitura de comentário do DataCrazy para o briefing; o `datacrazy-proxy` só busca leads pela tag "agendamento" e lê o campo "Lead ID" GS-XXXX. A função grava o texto recebido em `briefing`, onde a tela lê.
- **Schedule do CAPI e CRM** — triggers de banco no INSERT (`trg_meta_capi_schedule` → `notify_meta_capi('Schedule')`; `notify_crm_sync` → `datacrazy-crm-sync`, que resolve `sdr_name` por `created_by` → `profiles`). Um INSERT via service_role dispara ambos igual à tela. Nada disso será alterado.
- **Métricas/Ranking SDR** — `agendaMetrics.ts` conta como SDR quem tem `created_by` com papel `sdr` (ou `sdr_responsavel_id`). O João precisa existir como usuário real com role `sdr`.

## Pré-requisitos (automatizados na implementação)

1. **Usuário João Amorim** — Edge Function de setup `sdr-ia-setup` (mesmo padrão de `seed-gestor`: `auth.admin.createUser` com `email_confirm=true`, senha aleatória descartada), e-mail `joao.amorim.ia@ogruposilva.com.br`, `profiles.full_name='João Amorim'`, `available_for_scheduling=false`, `user_roles=sdr`. Idempotente (se já existir, só garante profile/role). Executada uma vez após o deploy e protegida pela mesma `SDR_IA_API_KEY`. Sem login Google (e-mail não é autorizado no OAuth) e senha nunca exposta.
2. **Canal "SDR IA"** — `app_settings.booking_channels` recebe "SDR IA"; `LEGACY_BOOKING_CHANNEL_VALUES` em `AgendarPage.tsx` e `BookingChannelPanel.tsx` mapeiam "SDR IA" ↔ `sdr-ia` para a função gravar `booking_channel='sdr-ia'` e o painel "Por canal do agendamento" exibi-lo.
3. Secret novo: **`SDR_IA_API_KEY`** (DataCrazy e Supabase já têm secrets no ambiente das funções).

## Mapeamento do body → colunas de `agendamentos`

| Campo do POST | Coluna |
|---|---|
| nome / lead_whatsapp | `lead_name` / `lead_phone` (normalizado com 55) |
| inicio ou slot_id | `scheduled_date` + `scheduled_time` (HH:MM, São Paulo), `duration_minutes=60` |
| slot_id → closer | NÃO grava `closer_id` no piloto (sempre `null`, fila). Nome do closer vai em `observation`: "Closer sugerido: <nome>" |
| sdr | `created_by` e `sdr_responsavel_id` = user João Amorim (nome validado contra `profiles.full_name`) |
| origem ("sdr-ia") | `booking_channel='sdr-ia'` |
| canal ("Tráfego Pago") | `channel_type` |
| briefing | `briefing` |
| funil, decisor_presente | `observation` ("Funil: vsl-direta · Decisor presente: sim · Closer sugerido: X") + `sdr_conversas.dados` |
| crm_lead_id | nova coluna `agendamentos.crm_lead_id text` + busca best effort do "Lead ID" GS-XXXX para `meta_lead_id` (melhora o casamento do Schedule) |
| idempotency_key | nova coluna `agendamentos.idempotency_key text` com índice único parcial |
| status / is_5k / is_venda_avulsa / meet_link / google_event_id | `agendada` / false / false / null / null |

## Arquivos a criar/alterar

- `supabase/functions/_shared/disponibilidade.ts` — porte fiel da regra de lotação da tela (horário comercial, closers ativos, agendamentos do dia, bloqueios + exceções, `count`/`capacity` por hora, corte `agora + 45 min`) e, por hora, contagem de agendamentos por closer para a sugestão.
- `supabase/functions/_shared/datacrazyLead.ts` — chamadas diretas à API do DataCrazy com os mesmos secrets (`DATACRAZY_API_URL/TOKEN`): resolver id da tag "agendamento" (`GET /tags`, cache), aplicar `POST /leads/{id}/tags` se o lead ainda não tiver, e ler o "Lead ID" GS-XXXX (mesma URL/field id do proxy). O `datacrazy-proxy` exige JWT de usuário, por isso a lógica é replicada sem tocar no proxy. Tudo best effort com timeout.
- `supabase/functions/silva-disponibilidade/index.ts` (GET), `supabase/functions/silva-agendar/index.ts` (POST) e `supabase/functions/sdr-ia-setup/index.ts` (POST, uso único) — `verify_jwt=false`, header `x-api-key` = `SDR_IA_API_KEY`, CORS igual às funções `silva-*`.
- `supabase/config.toml` — entradas `verify_jwt=false` para as três funções.
- `src/pages/AgendarPage.tsx`, `src/components/dashboard/BookingChannelPanel.tsx` — apenas o mapeamento do rótulo "SDR IA" ↔ `sdr-ia`.
- Migração SQL: `agendamentos.crm_lead_id`, `agendamentos.idempotency_key` (+ índice único parcial); tabelas `sdr_conversas`, `sdr_exclusoes`, `sdr_config` (GRANT ALL só para `service_role`, RLS ativado, sem policies → fechadas para anon/authenticated), índices em `telefone`, `etapa`, `last_lead_message_at`, trigger `updated_at`; seed do `sdr_config` (`link_video=https://vsl2.antoniodasilva.com.br/`, `system_prompt`, `tools_json`, `tags_json`, `handoff_attendant_id` vazios). "SDR IA" em `booking_channels` via update de dados.
- NÃO altera: `google-create-event`, `silva-reunioes`, `silva-vendas`, `datacrazy-proxy`, triggers de CAPI/CRM.

## GET /silva-disponibilidade

- Params `a_partir_de` (default agora), `ate` (default +3 dias), `limite` (default 6). Início mínimo = `max(a_partir_de, agora) + 45 min`, arredondado para a próxima hora cheia da grade.
- Um horário é livre quando está no horário comercial e `count < capacity` (lotação global, mesma regra da tela). Não há checagem por closer no piloto.
- `slot_id = "<ISO>|<closer_id>"` onde o closer é apenas sugestão: closer ativo, não bloqueado naquela hora, sem agendamento naquela hora, com menos agendamentos no dia (desempate por nome).
- Ordenação: início crescente; empate entre horários iguais não ocorre (um slot por hora). Resposta `{"gerado_em","slots":[{"slot_id","inicio","label"}]}`; labels pt-BR "hoje às 17h", "amanhã (sábado) às 10h", "segunda (14/09) às 15h"; sem nome de closer; vazio → `[]`.

## POST /silva-agendar

1. Validação Zod do body; telefone normalizado com 55; `sdr` deve ser "João Amorim".
2. `idempotency_key` já existe → 200 com o agendamento existente.
3. Telefone com agendamento futuro `agendada/confirmada` não excluído → 409 `ja_agendado` com o agendamento.
4. Revalida a hora com `_shared/disponibilidade.ts` (`count < capacity`); `slot_id`, se vier, só serve para extrair início e nome do closer sugerido → 409 `slot_indisponivel` se lotado.
5. Best effort: `meta_lead_id` via `crm_lead_id` e tag "agendamento" no DataCrazy (falhas só logam).
6. INSERT em `agendamentos` com `closer_id=null` (mapeamento acima) → triggers disparam Schedule (CAPI), sync CRM, notificação da fila e auditoria automática.
7. `audit_logs` (`create_agendamento_sdr_ia`, user João Amorim) e, se vier `crm_conversation_id`, upsert em `sdr_conversas` com `agendamento_id`, `telefone`, `lead_id`, `dados` (funil, decisor, closer sugerido).
8. 201 `{"agendamento_id","inicio","closer":null,"link_reuniao":null,"fila_atribuicao":true}`.
9. `// TODO fase 2:` gravar `closer_id` do slot e criar Meet (extrair miolo de `google-create-event` para `_shared/`), removendo "Closer sugerido" da observação.

## Garantias de equivalência com a tela

- Mesmas colunas, mesmos valores padrão, mesmo status inicial e mesmo caminho de triggers; `/silva-reunioes` lê `agendamentos` sem filtro de origem, então o registro aparece automaticamente; a fila "Aguardando atribuição" e a atribuição com Meet funcionam sem mudança.
- Teste de aceitação: rodar `sdr-ia-setup`; chamar `/silva-disponibilidade`; criar um agendamento de teste via `/silva-agendar` (e repetir com a mesma `idempotency_key` → 200; mesmo telefone → 409); conferir em `/silva-reunioes`, `meta_capi_events` (Schedule), fila "Aguardando atribuição", Métricas SDRs (João Amorim) e painel por canal; depois excluir o teste com justificativa.
