# Taxa de Coleta no painel de Vendas

## O que será feito

Adicionar um novo card "Taxa de Coleta" na aba Vendas do dashboard comercial, seguindo o racional: se foram vendidos R$ 50 mil e coletados R$ 42 mil, a taxa é 84%.

## Regras de cálculo

- **Coletado** = `vendas.valor` (o que efetivamente entrou no momento da venda).
- **Faturado** = `vendas.valor_total_projeto` (valor total da venda, já incluindo order bumps).
- **Taxa de Coleta** = `coletado_total / faturado_total * 100`.
- Só exibe o card quando `faturado_total > 0`.
- Inclui vendas de calls e vendas avulsas.
- Order bumps entram no faturado porque fazem parte do valor total do projeto, mas **não** aumentam o coletado (o coletado continua sendo apenas o valor pago na hora).

## Ajustes técnicos

1. **Cálculo no backend**
   - Alterar a função `dashboard_vendas_kpis` para retornar também `taxa_coleta` (ou deixar o cálculo no frontend, usando os valores já disponíveis `coletado_calls`, `coletado_avulsa`, `faturado_calls`, `faturado_avulsa`).
   - Garantir que `faturado_calls` use `COALESCE(valor_total_projeto, valor, 0)` — já faz isso hoje.

2. **Lançamento de venda (closer e gestor)**
   - Hoje `GestorVendaDialog.tsx` e `VendaDialog.tsx` gravam `valor`, mas não preenchem `valor_total_projeto`.
   - Passar a gravar `valor_total_projeto = valor + soma dos order bumps` automaticamente ao salvar.
   - No modal de venda avulsa (`AvulsaSaleDialog.tsx`) os campos "Valor coletado" e "Valor total" já são separados; manter manual, mas exibir um aviso se o total for menor que o coletado.

3. **Novo card na tela**
   - Inserir o card "Taxa de Coleta" ao lado de "Coletado Total" e "Coletado Médio" em `src/components/dashboard/VendasTab.tsx`.
   - Valor formatado como percentual (ex.: 84,0%).
   - Subtexto: "Coletado Total ÷ Valor total do projeto (com order bumps)".
   - Clique abre drilldown listando as vendas do período com as colunas coletado / faturado / taxa individual.

4. **MCP**
   - Atualizar `src/lib/mcp/tools/sales-kpis.ts` para expor `taxa_de_coleta` no objeto `financeiro`.

5. **Verificação**
   - Build e `git diff --check`.
   - Validar com dados de 14/09/2026: coletado R$ 40.600 / faturado esperado = taxa correspondente.
