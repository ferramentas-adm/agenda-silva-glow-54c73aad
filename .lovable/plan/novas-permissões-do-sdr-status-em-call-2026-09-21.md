# Novas permissões do SDR + status "Em call"

## O que muda para o SDR

1. **Trocar o closer de uma reunião já atribuída** — o SDR passa a ver e usar o seletor de closer nos detalhes do agendamento, com a etiqueta de turma (A/B), como os gestores. A troca só altera o closer no sistema: o link do Meet atual é mantido e nada muda no Google Calendar.
2. **Comentar no briefing de reuniões de outros SDRs** — o SDR **não** edita nem apaga o briefing de outro SDR. Ele acrescenta um novo comentário/briefing próprio, e o closer passa a ver todos os comentários da reunião em ordem, cada um com o nome do SDR que escreveu e a data/hora. Cada SDR pode editar ou apagar apenas os comentários que ele mesmo escreveu; gestores podem apagar qualquer um.
3. **Confirmar e marcar "Não compareceu" em reuniões de outros SDRs** — os dois botões deixam de exigir que ele seja o criador/responsável. O fluxo do "Não compareceu" continua igual: motivo da lista oficial + justificativa, e depois a oferta de criar nova reunião.
4. **Continua bloqueado:** trocar o **SDR responsável** só é permitido nas reuniões que ele próprio criou. Nada mais muda aqui.

## Novo status "Em call"

- Novo status **Em call**, usado pelo SDR para sinalizar que o lead realmente entrou na reunião.
- Botão "Em call" aparece nos detalhes do agendamento para SDR e gestores, quando a reunião está em Agendado / Confirmada / Não confirmada / Aguardando atribuição.
- Estando **Em call**, o único botão de desfecho oferecido ao SDR é **Realizada**. Gestor, moderador e supervisor mantêm todos os botões e a reversão de status, para corrigir erros.
- **Closer não é restringido pelo Em call** — ele continua vendo exatamente os mesmos botões de sempre: **Realizada** (sempre) e **Não compareceu** (quando foi ele quem criou a reunião). Nada muda para o closer.
- **Não dispara nenhuma mensagem ao lead** — é marcação interna.
- Nas métricas, "Em call" conta como reunião **em aberto** (pendente de desfecho), não como realizada: continua aparecendo nas pendências e na trava de reuniões atrasadas até virar Realizada.
- Cor/etiqueta próprias (roxo) no calendário, na lista de reuniões, nos logs de auditoria e nos drill-downs.

## Logs de auditoria

Todas as ações novas passam a aparecer no módulo de Logs de Auditoria, com nome de quem fez, lead, data/hora da reunião e o detalhe da mudança:

- Troca de closer feita por SDR (de quem para quem) — já registrada, ganha rótulo indicando que veio do SDR.
- Comentário de briefing: criado, editado e removido, com o autor e um resumo do texto.
- Mudança de status para **Em call** e de Em call para Realizada, com o status anterior.
- A tela de auditoria ganha esses tipos nos filtros e nas descrições legíveis (nada de texto técnico cru).

## Detalhes técnicos

- Migração 1: novo valor `em_call` no enum `appointment_status`.
- Migração 2: nova tabela `agendamento_briefings` (id, agendamento_id, author_id, content, created_at, updated_at, deleted_at) com GRANTs para `authenticated`/`service_role`, RLS: SELECT para autenticados; INSERT com `author_id = auth.uid()`; UPDATE/DELETE só do próprio autor ou gestor/moderador/supervisor. Gatilho de auditoria gravando em `audit_logs` (`add_briefing_comment`, `edit_briefing_comment`, `remove_briefing_comment`). O campo `agendamentos.briefing` atual é preservado e continua exibido como o briefing original.
- `src/integrations/supabase/types.ts` regenerado após as migrações.
- Garantir que os gatilhos de aviso externo (`notify_status_change_webhook`, `notify_status_change`) ignorem `em_call`.
- `src/pages/DashboardPage.tsx`: `canChangeStatus` e o bloco do botão "Não compareceu" deixam de exigir posse para `role === "sdr"`; `canEditCloser` passa a incluir `sdr` (usa `handleChangeCloser`, sem `google-transfer-event`); `canEditSdr` permanece restrito ao criador; novo botão "Em call" com exibição condicional dos desfechos por status e função — a trava de "Em call" vale apenas para `role === "sdr"`; `STATUS_LABELS`/`STATUS_COLORS` ganham `em_call`.
- `BriefingDrawer`: passa a listar o briefing original + a lista de comentários (autor, data, texto) com campo "Adicionar comentário"; editar/apagar só nos próprios comentários. Mesma visão para o closer.
- Incluir `em_call` nas listas de status "em aberto": `usePendingMeetings`, `useOverdueMeetings`, `src/lib/agendaMetrics.ts`, `BloqueioMassaPage`.
- Rótulos em `ReunioesListPage` (STATUS_MAP + filtro), `AuditLogsPage` (rótulos, filtros e descrições das novas ações), `MetricDrilldownDialog`, `PendingMeetingsBanner`, `OverdueMeetingsLockOverlay`, e o enum de status em `src/lib/mcp/tools/list-appointments.ts`.
- Nada nas rotas da IA SDR (`silva-*`), CAPI, CRM ou planilhas é alterado.
