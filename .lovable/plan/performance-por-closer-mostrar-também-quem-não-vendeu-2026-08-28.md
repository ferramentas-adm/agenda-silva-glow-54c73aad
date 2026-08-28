# Performance por Closer: mostrar também quem não vendeu

## O que muda

Hoje o quadro lista apenas closers que tiveram venda no período. Passa a listar **todos os closers com atividade no período**, mesmo com zero vendas:

- Entra no quadro qualquer closer com reunião realizada no período (respeitando o filtro Geral / Social Selling / Tráfego) ou com venda registrada.
- Quem não vendeu aparece como "0 vendas · N reuniões · 0% conv.", receita R$ 0 e tíquete médio R$ 0.
- Ordenação: closers com venda continuam no topo por conversão (depois vendas, receita, reuniões); closers com 0 venda ficam abaixo, ordenados por mais reuniões realizadas.
- O drilldown de vendas do closer continua igual; para quem tem 0 venda, o clique não abre lista (nada para mostrar).

## Detalhes técnicos

- `src/components/dashboard/VendasTab.tsx`, `closerPerf`: construir a chave do mapa a partir da união de `realizadasPorCloser` e dos closers com venda em `vendasDia`, em vez de iterar somente `map` (vendas). Vendas ausentes = `{ vendas: 0, receita: 0 }`.
- Manter os filtros atuais (`closerChannelFilter` por `channel_type`, `isCloserView`/`myCloserId` na query de realizadas).
- Ajustar o `sort` para separar em dois blocos: `(b.vendas > 0) - (a.vendas > 0)` primeiro, então os critérios atuais, com `b.total - a.total` como desempate final.
- Mensagem de estado vazio permanece para quando não houver nem reuniões nem vendas no período.
- Sem mudanças de banco e sem novas queries.
