
## Prompt para colar no outro projeto Lovable

Copie e cole o bloco abaixo, em uma única mensagem, no chat do outro projeto Lovable. Ele descreve toda a lógica, banco, permissões, fluxo do SDR e a tela do gestor.

---

**Objetivo:** Mudar o fluxo de agendamento. Hoje o SDR escolhe o Closer ao agendar. Quero que o SDR agende apenas o **horário** (data + hora + duração) e que a reunião entre em uma fila chamada **"Aguardando atribuição"**, onde apenas Gestor / Moderador / Supervisor podem atribuir o Closer. Só depois da atribuição é que o evento no Google Calendar é criado, o link do Meet é gerado e o webhook do CRM ("Agendado") é disparado.

### 1. Banco de dados (Supabase)

Na tabela `agendamentos`:
- `closer_id` deve ser **nullable** (uma reunião nasce sem Closer).
- Adicionar (se ainda não existirem):
  - `sdr_responsavel_id uuid` — quem agendou.
  - `meeting_reason text` — `primeira_reuniao` | `segunda_reuniao` (default null = 1ª).
  - `original_agendamento_id uuid` — usado em reagendamentos.
  - `sdr_error boolean default false`, `sdr_error_at timestamptz`, `sdr_error_by uuid`, `sdr_error_description text`.
  - `meet_link text`, `google_event_id text`.
  - `deleted_at timestamptz`, `deletion_reason text` (soft delete).
- Trigger `BEFORE INSERT`: se vier `status = 'confirmada'`, força `status = 'agendada'`. INSERT sempre nasce como `agendada` (ou `reagendada` quando `original_agendamento_id` não for null).
- Trigger `AFTER INSERT` que dispara uma notificação `pending_closer_assignment` para todos os usuários com role `gestor`, `moderador` ou `supervisor` **quando `closer_id IS NULL`**:
  - Insere em `notifications (user_id, type, title, message, entity_type, entity_id)` para cada um desses usuários.
- Webhook do CRM (`notify_status_change_webhook`): **não disparar nada enquanto `closer_id IS NULL`**. Só envia "Agendado" quando o Closer for atribuído (UPDATE em que `OLD.closer_id IS NULL AND NEW.closer_id IS NOT NULL`).
- RLS:
  - SDR pode `INSERT` agendamentos onde `created_by = auth.uid()`, **mesmo com `closer_id` nulo**.
  - SDR pode `UPDATE` apenas as suas; Gestor/Moderador/Supervisor podem `UPDATE` qualquer.
  - Apenas Gestor/Moderador/Supervisor podem definir `closer_id` quando antes era nulo.
- Permissão `assign_closer` na tabela `role_permissions`: `true` para gestor, moderador e supervisor; `false` para SDR e closer.

### 2. Fluxo do SDR ao agendar

Na página de agendamento usada pelo SDR:
- Remover o seletor de Closer da UI.
- O SDR escolhe: lead (nome, telefone), data, hora, duração, canal de aquisição, briefing, `meeting_reason`, `is_5k`.
- Ao confirmar, INSERT em `agendamentos` com `closer_id = null`, `status = 'agendada'`, `sdr_responsavel_id = auth.uid()`, `created_by = auth.uid()`.
- **Não** chamar Google Calendar nem webhook nesse momento — isso é responsabilidade do passo de atribuição.
- Validação de horário: SDR não vê disponibilidade de Closer específico; basta validar conflito de horário do próprio lead (mesmo telefone na mesma data/hora).
- Gestor / Moderador / Supervisor / Closer continuam podendo agendar **com** Closer selecionado direto (fluxo legado), e nesse caso o evento + Meet + webhook são criados na hora.

### 3. Tela "Aguardando atribuição"

Rota nova `/aguardando-atribuicao`, protegida pela permissão `assign_closer`. Item no menu lateral com badge contando quantas reuniões estão na fila.

Listar todos os `agendamentos` onde:
```
closer_id IS NULL
AND deleted_at IS NULL
AND status <> 'cancelada'
AND (meeting_reason IS NULL OR meeting_reason <> 'segunda_reuniao')
AND scheduled_date >= hoje
ORDER BY scheduled_date, scheduled_time
```

Cada card mostra: nome do lead, telefone, data/hora, duração, canal, badge "1ª Reunião" / "Reagendamento", badge "Projeto 5K" se `is_5k`, nome do SDR responsável, histórico do lead (contar reuniões anteriores pelo telefone normalizado), e — se for reagendamento — a data da reunião original.

Ações por card:
1. **Selecionar Closer** (dropdown com closers ativos). Validar:
   - Bloqueios de agenda do Closer (tabela `closer_blocks`, recorrentes ou pontuais).
   - Limite de 2 reuniões por Closer no mesmo `scheduled_date + scheduled_time`.
   
   Ao confirmar: criar evento no Google Calendar do Closer (gera Meet link), depois `UPDATE agendamentos SET closer_id, meet_link, google_event_id WHERE id = ...`. A atribuição é o que dispara o webhook "Agendado" no CRM.

2. **Erro de SDR** e **Erro de SDR + Excluir**: abrem modal pedindo descrição (obrigatória). Gravam `sdr_error = true`, `sdr_error_at`, `sdr_error_by`, `sdr_error_description`. A versão "+ Excluir" também faz soft delete (`deleted_at = now()`, `deletion_reason = 'Erro de SDR: …'`).

Polling automático a cada 30s e badge no menu lateral usando a mesma query (com `count: 'exact', head: true`).

### 4. Reagendamentos

Quando uma reunião existente é reagendada:
- Cria-se um NOVO `agendamento` com `original_agendamento_id` apontando para o anterior, `closer_id = null` (volta para a fila) e `status = 'reagendada'`.
- A original recebe `status = 'reagendada'` via trigger `detect_and_mark_reschedule`.
- Ela aparece em "Aguardando atribuição" como qualquer outro item, com badge "Reagendamento" e a data da original.

### 5. Notificações no sino

- Trigger insere em `notifications` quando uma reunião nasce sem Closer.
- O sino do app lista essas notificações e leva para `/aguardando-atribuicao`.

### 6. Permissões resumidas

| Papel | Agendar sem Closer | Atribuir Closer | Ver fila |
|---|---|---|---|
| SDR | sim (sempre sem) | não | não |
| Closer | não (agenda na própria) | não | não |
| Gestor / Moderador / Supervisor | opcional | sim | sim |

### 7. Critérios de aceite

- SDR não vê mais o seletor de Closer.
- Ao agendar, a reunião aparece imediatamente em "Aguardando atribuição" para Gestor/Moderador/Supervisor, com notificação no sino.
- Nenhum evento de Google Calendar / Meet / webhook do CRM é disparado antes da atribuição.
- Após atribuir, o evento é criado, o Meet link é salvo e o webhook "Agendado" sai com o nome do Closer.
- 2ª reunião e reuniões já com Closer **não** aparecem na fila.
- Erros de SDR ficam registrados e visíveis no módulo de Erros SDR.

Implemente tudo (migração SQL, triggers, ajustes de RLS, UI do agendamento e a página `/aguardando-atribuicao`) seguindo a estrutura acima.
