# Marcar leads recuperados: dashboard e planilha de motivos

Hoje, quando um lead que "não fechou" compra depois (nova reunião ou venda avulsa), o registro antigo continua contando como não-fechamento em todo lugar. Decisão tomada:

- **Dashboard comercial**: o card de motivos **mantém** a contagem, mas marca os casos recuperados.
- **Planilha do Google Sheets**: nova **coluna** indicando o fechamento posterior (a linha continua, para preservar o histórico do dia).

## 1. Dashboard — selo "Fechou depois"

- No card "Motivos de não fechamento" (lista detalhada e CSV exportado), cada linha de lead que fechou posteriormente ganha um selo discreto: **"Fechou em DD/MM"**.
- O que conta como "fechou depois": existe uma venda do mesmo lead (identificado pelo telefone normalizado) com `vendeu = true` e `valor > 0`, lançada depois da reunião em que não fechou — seja em nova reunião, seja em venda avulsa.
- As **contagens por motivo e o total não mudam** — é apenas uma marcação visual sobre o que já existe.
- O CSV baixado do card ganha a coluna "Fechou depois" com a data.

## 2. Planilha do Google Sheets — nova coluna

- A exportação diária passa a ter uma 14ª coluna: **"Fechou depois?"**.
- Valores: `Sim — DD/MM/AAAA` (com a data do fechamento) ou `Não`.
- A verificação é feita no momento do envio/reenvio do dia: para cada lead da aba, procura venda posterior com valor > 0 do mesmo telefone.
- Vale para envios automáticos e reenvios manuais; abas já enviadas só ganham a coluna se o dia for reenviado.

## 3. Validação

- Conferir com dados reais: um lead com não-fechamento antigo e venda posterior deve aparecer marcado no card e com `Sim — data` na planilha.
- Leads que nunca fecharam seguem sem marcação (`Não`).

## Detalhes técnicos

- **Dashboard**: em `VendasTab.tsx`, montar um mapa de telefone normalizado → data do primeiro fechamento com `valor > 0`, buscando vendas posteriores aos não-fechamentos do período (consulta dedicada, sem mexer nas RPCs `dashboard_vendas_motivos`/`dashboard_vendas_kpis`, para não alterar contagens). Selo na lista detalhada do card; coluna extra no CSV.
- **Planilha**: em `supabase/functions/sheets-motivos-daily/index.ts`, após montar `rowsData`, consultar `vendas` (join `agendamentos` pelo telefone) com `vendeu = true`, `valor > 0` e data posterior à reunião de cada linha; adicionar a coluna ao `HEADERS` e às linhas. Sem mudança de formato das colunas existentes — só uma coluna nova no fim.
- Telefone normalizado (só dígitos) nos dois lados para o cruzamento não falhar por formatação.
- Nada disso altera métricas existentes, RPCs de dashboard, nem os formatos de `slot_id`/`agendamento_id` consumidos pelas automações.
