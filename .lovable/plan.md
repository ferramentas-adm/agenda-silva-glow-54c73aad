# Padronizar "Observações" → "Justificativa" no card do drilldown

## Diagnóstico (confirmado)
O card da imagem ("Motivo: Analisando o contrato — Hoje") **não** é o da Lista de Reuniões — é o `MetricDrilldownDialog` (o painel que abre ao clicar num número da dashboard). Por isso o ajuste anterior (feito só em `ReunioesListPage.tsx`) não apareceu nessa tela.

- `src/components/dashboard/MetricDrilldownDialog.tsx:731` mostra o título "Observações" lendo `vendas.observacoes` (linha 628) — o **mesmo campo** da "Justificativa" do Resultado da Reunião. Confirmado.
- O card da Lista de Reuniões (`ReunioesListPage.tsx:1286`) já está como "Justificativa".

## Mudança
- Em `src/components/dashboard/MetricDrilldownDialog.tsx`, trocar o rótulo "Observações" por "Justificativa" (apenas o texto exibido; o dado lido continua `vendas.observacoes`).

## Fora de escopo (propositalmente)
- Cabeçalho "Observação" da tabela/CSV da Lista de Reuniões (linha 987/468): esse é o campo `agendamentos.observacao`, um campo **diferente** (anotação do agendamento, não a justificativa do resultado). Renomeá-lo causaria confusão inversa.
- "Observações" em Pagamentos/Follow-ups: campos próprios, sem relação.

## Validação
- Typecheck e abrir o drilldown de um motivo de não fechamento para conferir o novo rótulo.
