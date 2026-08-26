# Trocar a flag "NO-SHOW" por "NÃO COMPARECEU"

Como até ontem havia dois status separados (No-show e Cancelado), a flag "NO-SHOW" nos cartões passou a dar a impressão errada de que todo lead ausente é no-show. A flag passa a exibir **"Não compareceu"**, alinhada ao botão de mesmo nome.

## O que muda

- Flag de status nos cartões do Calendário (dashboard) e no grid do dia.
- Etiqueta de status na Lista de Reuniões, nos Detalhes do Lead, no detalhamento de métricas e nos Logs de Auditoria.
- Rótulo do status anterior mostrado na tela Aguardando Atribuição.

## O que NÃO muda

- Os quadros de métricas do dashboard continuam com o nome atual ("No-shows", "Contabilizado como No-show").
- A lista de motivos de justificativa continua igual, incluindo o motivo "No-show".
- Nada muda no banco: o status gravado continua sendo o mesmo, então histórico, relatórios, webhooks e o CRM seguem funcionando igual.

## Detalhes técnicos

Apenas troca do texto de exibição de `no_show` nos mapas de rótulos:

- `src/pages/DashboardPage.tsx` (`STATUS_LABELS`)
- `src/pages/ReunioesListPage.tsx` (`STATUS_MAP`)
- `src/pages/LeadDetalhesPage.tsx` (`STATUS_LABEL`)
- `src/pages/AuditLogsPage.tsx` (`STATUS_LABELS_AG`, `STATUS_LABELS_DETAIL`)
- `src/components/dashboard/MetricDrilldownDialog.tsx` (`STATUS_LABEL`)
- `src/pages/AguardandoAtribuicaoPage.tsx` (`statusMap`)

As cores (laranja) e todas as chaves de status permanecem inalteradas. Nos cartões estreitos o texto é exibido em caixa alta e truncado; será mantido o comportamento atual de truncamento, sem alterar o layout.
