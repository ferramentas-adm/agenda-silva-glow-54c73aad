# Novas permissões do SDR + status "Em call"

## O que muda para o SDR

1. **Trocar o closer de uma reunião já atribuída** — o SDR passa a ver e usar o seletor de closer nos detalhes do agendamento, com a etiqueta de turma (A/B), como os gestores. A troca só altera o closer no sistema: o link do Meet atual é mantido e nada muda no Google Calendar.
2. **Editar o briefing de reuniões de outros SDRs** — o SDR pode abrir, editar e remover o briefing de qualquer reunião (hoje isso está limitado às dele).
3. **Confirmar e marcar "Não compareceu" em reuniões de outros SDRs** — os dois botões deixam de exigir que ele seja o criador/responsável. O fluxo do "Não compareceu" continua igual: motivo da lista oficial + justificativa, e depois a oferta de criar nova reunião.
4. **Continua bloqueado:** trocar o **SDR responsável** só é permitido nas reuniões que ele próprio criou. Nada mais muda aqui.

## Novo status "Em call"

- Novo status **Em call**, usado pelo SDR para sinalizar que o lead realmente entrou na reunião.
- Botão "Em call" aparece nos detalhes do agendamento para SDR e gestores, quando a reunião está em Agendado / Confirmada / Não confirmada / Aguardando atribuição.
- Estando **Em call**, o único botão de desfecho oferecido ao SDR é **Realizada**. Gestor, moderador e supervisor mantêm todos os botões e a reversão de status, para corrigir erros.
- **Não dispara nenhuma mensagem ao lead** — é marcação interna.
- Nas métricas, "Em call" conta como reunião **em aberto** (pendente de desfecho), não como realizada: continua aparecendo nas pendências e na trava de reuniões atrasadas até virar Realizada.
- Cor/etiqueta próprias (roxo) no calendário, na lista de reuniões, nos logs de auditoria e nos drill-downs.

## Detalhes técnicos

- Migração: novo valor `em_call` no enum `appointment_status`; `src/integrations/supabase/types.ts` regenerado.
- Garantir que os gatilhos de aviso externo (`notify_status_change_webhook`, `notify_status_change`) ignorem `em_call`, para não gerar mensagem/lembrete ao lead.
- `src/pages/DashboardPage.tsx`: `canChangeStatus` e o bloco do botão "Não compareceu" deixam de exigir posse para `role === "sdr"`; `canEditCloser` passa a incluir `sdr` (usa `handleChangeCloser`, sem `google-transfer-event`); `canEditSdr` permanece restrito ao criador; novo botão "Em call" e regra de exibição condicional dos desfechos por status e função; `STATUS_LABELS`/`STATUS_COLORS` ganham `em_call`.
- Briefing: liberar edição/remoção para SDR no drawer (`BriefingDrawer` via DashboardPage); a política RLS de UPDATE já permite (`is_manager_or_sdr()`).
- Incluir `em_call` nas listas de status "em aberto": `usePendingMeetings`, `useOverdueMeetings`, `src/lib/agendaMetrics.ts`, `BloqueioMassaPage`.
- Rótulos em `ReunioesListPage` (STATUS_MAP + filtro), `AuditLogsPage`, `MetricDrilldownDialog`, `PendingMeetingsBanner`, `OverdueMeetingsLockOverlay`, e o enum de status em `src/lib/mcp/tools/list-appointments.ts`.
- Nada nas rotas da IA SDR (`silva-*`), CAPI, CRM ou planilhas é alterado.
