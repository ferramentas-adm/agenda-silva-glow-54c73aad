# Motivo de cancelamento configurável

Hoje, ao clicar em "Cancelar" em "Detalhes do agendamento", já aparece um modal pedindo o motivo — mas é um campo de texto livre. A mudança transforma isso em uma lista de opções gerenciável em "Administração > + Listas".

## O que muda

**1. Nova lista em "+ Listas": "Motivos de cancelamento"**
- Mesmo padrão dos outros cards (Tipos de canal, Motivos de não fechamento): adicionar, editar e remover opções.
- Opções iniciais: Imprevisto do lead; Sem motivo explícito; Desistiu; Sem closer disponível; Outros.

**2. Modal de cancelamento**
- Passa a mostrar um seletor com as opções cadastradas (obrigatório).
- Ao escolher "Outros", aparece um campo de texto obrigatório para descrever o motivo.
- O valor gravado continua no mesmo campo do agendamento (`cancellation_reason`); para "Outros" grava-se "Outros: <texto digitado>".
- Nada muda no restante do fluxo de cancelamento (status, auditoria, webhooks).

## Detalhes técnicos

- `src/hooks/useAppSettingList.ts`: adicionar chave `cancellation_reasons` em `APP_SETTING_KEYS` e o rótulo em `APP_SETTING_LABELS`.
- `src/pages/AdminPage.tsx` (`DynamicListsSection`): novo `DynamicListManager` com `settingKey={APP_SETTING_KEYS.cancellation_reasons}` e `defaults` = as 5 opções.
- `src/components/CancelReasonDialog.tsx`: usar `useAppSettingList("cancellation_reasons", defaults)` para popular um `Select`; estado extra para o texto de "Outros"; validação (opção obrigatória, texto obrigatório e ≤ 200 caracteres quando "Outros"); manter a assinatura `onConfirm(reason: string)` para não afetar os chamadores (`DashboardPage.tsx` e `PendingMeetingsBanner.tsx`).
- Sem alteração de banco de dados: as opções ficam em `app_settings`, como as outras listas.
