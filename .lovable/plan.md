# Ordenação do ranking "Performance por Closer"

## O que muda

O quadro passa a ter um seletor de ordenação, ao lado dos filtros Geral / Social Selling / Tráfego, com estas opções:

- **Coletado (R$)** — maior receita primeiro
- **Taxa de conversão** — maior % primeiro
- **Tíquete médio** — receita / vendas (closers sem venda ficam por último)
- **Volume de vendas** — mais vendas primeiro
- **Reuniões realizadas** — mais reuniões primeiro

Padrão ao abrir a tela: **Coletado (R$)**, que é a leitura mais usada. Em qualquer opção, o desempate segue por conversão, vendas, receita e reuniões, e closers com 0 venda continuam listados (aparecem ao fim quando a métrica escolhida é zero para eles).

O filtro de canal, o período, o drilldown de vendas por closer e todos os números exibidos permanecem exatamente como estão — muda apenas a ordem da lista.

Em telas estreitas o seletor quebra para a linha de baixo, mantendo os botões de canal legíveis.

## Detalhes técnicos

- `src/components/dashboard/VendasTab.tsx`: novo estado `closerSortKey` (`"receita" | "conversao" | "ticket" | "vendas" | "realizadas"`, padrão `"receita"`) e um `Select` compacto no `CardHeader` do quadro Performance por Closer.
- O `useMemo` de `closerPerf` recebe `closerSortKey` na lista de dependências; o comparador escolhe a métrica primária conforme a chave (tíquete médio calculado como `vendas > 0 ? receita / vendas : 0`) e cai nos critérios atuais como desempate.
- Sem mudanças de query, RPC ou banco — a ordenação é apenas do lado do cliente sobre os dados já agregados por `dashboard_vendas_closer_perf`.
