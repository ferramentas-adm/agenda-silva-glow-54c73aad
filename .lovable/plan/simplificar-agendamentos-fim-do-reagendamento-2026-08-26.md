# Simplificar agendamentos: fim do reagendamento

Todas as reuniões passam a ser reuniões novas. "No-show" e "Cancelar" são substituídos por um único botão **Não compareceu** com justificativa obrigatória, seguido da oferta de criar um novo agendamento para o mesmo lead.

## O que muda para o usuário

**1. Botão único "Não compareceu"**
- Nos "Detalhes do agendamento" (Calendário), na Lista de Reuniões, no banner de reuniões em aberto e na tela de travamento de reuniões vencidas, os botões "Cancelar", "No-show" e "Reagendar/Alterar horário" dão lugar a um só botão: **Não compareceu**.
- Ao clicar, abre o modal de justificativa com lista suspensa (obrigatória). Motivos iniciais:
  - No-show
  - Cancelou por imprevisto pessoal
  - Cancelou por desistência
  - Alterou horário para o mesmo dia
- A lista fica editável pelos Gestores em **Administração > + Listas > "Motivos de não comparecimento"**.
- Em todos os casos o status gravado é **No-show**, e o motivo escolhido fica registrado na reunião (campo de justificativa que já existe) e na auditoria.

**2. Pop-up de novo agendamento**
- Depois de confirmar "Não compareceu", aparece um pop-up perguntando se deseja agendar novamente para esse lead.
- "Sim, agendar novamente" leva à tela **Agendar** já com os dados do lead carregados (nome, telefone, e-mail, canal, motivo da reunião, closer e observações/briefing quando existirem), bastando escolher dia e horário.
- "Não, agora não" apenas fecha.

**3. Alteração de horário**
- Deixa de existir botão próprio. Mudança de horário passa pelo caminho "Não compareceu" com o motivo "Alterou horário para o mesmo dia" e, em seguida, o novo agendamento.

**4. Fim do "Reagendada"**
- Nenhuma reunião nova recebe o status "Reagendada" e o vínculo com reunião anterior deixa de ser criado.
- A detecção automática de "reunião anterior do mesmo lead" na tela Agendar deixa de propor reagendamento/exclusão: a nova reunião é sempre criada normalmente.
- Reuniões antigas com status "Reagendada" continuam visíveis no histórico, filtros e cards do dashboard.

**5. Exclusão de reuniões**
- SDR e Closer não veem mais a opção de excluir reunião.
- Somente Gestor, Supervisor e Moderador podem excluir, com justificativa (como hoje).

## Detalhes técnicos

- `src/hooks/useAppSettingList.ts`: nova chave `no_show_reasons` + rótulo "Motivos de não comparecimento"; a chave `cancellation_reasons` permanece para histórico.
- `src/pages/AdminPage.tsx` (`DynamicListsSection`): novo `DynamicListManager` para `no_show_reasons` com os 4 defaults.
- `src/components/CancelReasonDialog.tsx` → generalizar como diálogo de "Não compareceu": título/labels novos, lista vinda de `no_show_reasons`, opção "Outros" com texto livre (≤200 caracteres) mantida. Assinatura `onConfirm(reason)` preservada.
- Novo `src/components/NovoAgendamentoPromptDialog.tsx`: pop-up de oferta, navega para `/agendar?lead_name=…&lead_phone=…&lead_email=…&channel=…&meeting_reason=…&closer=…`.
- `src/pages/AgendarPage.tsx`: aceitar os parâmetros de prefill sem `edit` (hoje `lead_name`/`lead_phone` só são lidos no fluxo de reagendamento); remover uso de `detectPriorMeetingConflict`, do bloco de escolha de desfecho da reunião anterior, de `original_agendamento_id` e da marcação `status: "reagendada"`.
- `src/pages/DashboardPage.tsx`: substituir os botões Cancelar/No-show/"Alterar horário" por "Não compareceu" (grava `status: "no_show"` + `cancellation_reason`), abrir o pop-up de novo agendamento no sucesso, remover o bloco `sdrBlocked` de "reagendada" e o modal de reagendamento; `onDelete` do `DayView` apenas para `isAdminLike`.
- `src/pages/ReunioesListPage.tsx`: `canDelete = isAdminLike`; ações de status usam o novo fluxo.
- `src/components/PendingMeetingsBanner.tsx` e `src/components/OverdueMeetingsLockOverlay.tsx`: opções reduzidas a "Realizada" e "Não compareceu" (com justificativa + oferta de novo agendamento); remover botão "Reagendar" e a navegação para `/cancelar-reuniao`.
- `src/services/reagendamento.ts`: reduzir ao que ainda é usado (remover classificação de conflito, `markPriorAsReagendada`, `closePriorMeeting` e as mensagens de reagendamento). `canDeleteMeeting`/`DELETE_BLOCKED_MESSAGE` continuam valendo para a exclusão dos Administradores/Moderadores? Não: como só admins excluem e eles já ignoram a trava hoje, as chamadas saem das telas.
- Rota/página `CancelarReuniaoPage.tsx` deixa de ser usada e é removida do `App.tsx`.
- Dashboards e relatórios que somam `no_show + cancelada + reagendada` continuam corretos sem alteração.
- Sem mudanças de banco de dados: status `no_show` e campo de justificativa já existem; motivos ficam em `app_settings`.
