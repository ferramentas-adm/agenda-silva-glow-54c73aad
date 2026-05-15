## O que será alterado

Adicionar o **resumo do cliente** (campo `resumo_venda` — o que o cliente faz/vende) e o **status de follow-up** em dois lugares onde hoje só aparece a explicação do não-fechamento.

### 1. Drilldown de "Compareceu" (e demais cards do Dashboard Comercial)
Arquivo: `src/components/dashboard/MetricDrilldownDialog.tsx`

Hoje a lógica mostra **ou** a explicação do não-fechamento **ou** o resumo/observações — nunca os dois. Mudar para mostrar:

- **Sempre** que houver `resumo_venda` → bloco "Resumo do cliente" (o que ele vende).
- **Sempre** que houver `explicacao_nao_fechamento` → bloco "Explicação do porquê não fechou".
- **Sempre** que houver `observacoes` (e for diferente do resumo) → bloco "Observações".
- Adicionar **badge "Follow ativo" / "Sem follow"** ao lado do badge de status (puxando `follow_up` da venda; verde quando ativo, cinza quando não).

Incluir `follow_up` no `select` da query `drilldown-vendas`.

### 2. Drilldown de "Follows por Closer" (tarefas e follow-ups)
Arquivo: `src/components/dashboard/CargaClosersTab.tsx`

Hoje cada item mostra apenas título, data, telefone e descrição (motivo). Adicionar:

- Buscar `resumo_venda` da última venda de cada `agendamento_id` listado no drill (uma query nova `vendas` filtrada por `agendamento_id IN (...)`, indexada por agendamento).
- Renderizar bloco "**Resumo do cliente**" abaixo da descrição/motivo, em todos os buckets (tarefas e follow-ups), quando houver resumo.

### Notas técnicas

- Nenhuma migration. `resumo_venda` e `follow_up` já existem em `vendas`.
- Drilldown do Closer: tarefas têm `agendamento_id` opcional; follow-ups sempre têm. Buscar resumo só onde houver `agendamento_id`.
- Manter padrão visual existente (mesmos `rounded-md border bg-muted/40 p-2`).
