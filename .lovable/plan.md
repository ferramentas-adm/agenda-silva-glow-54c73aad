## O que será feito

### 1. Métrica "% de calls com oferta de preço" (Dashboard Comercial)

Adicionar um novo card/indicador no topo da aba de Vendas (junto com os totais já existentes) mostrando:

- **Realizadas no dia/intervalo** (já existe)
- **Calls com oferta de preço** = vendas onde `valor > 0` (inclui vendas fechadas, pois toda venda fechada implica preço apresentado) OU registros marcados como "apresentou preço = sim"
- **% de oferta** = `calls com oferta ÷ realizadas`

Como detectamos "apresentou preço": usando o que já é gravado hoje em `vendas` — `valor IS NOT NULL AND valor > 0` indica que houve oferta (regra introduzida no ajuste recente do VendaDialog). Não cria coluna nova.

### 2. Conversão por produto oferecido + tíquete médio (aba Vendas)

Novo painel "Performance por Produto" na `VendasTab`, com uma linha por produto (`vendas.produto`):

- Ofertas (qtde de vendas registradas com aquele produto)
- Vendas fechadas (vendeu = true)
- Conversão = fechadas ÷ ofertas
- Tíquete médio = média de `valor` apenas das vendas fechadas
- Receita total

Ordenado por receita desc. Produtos vazios/null agrupados como "Sem produto".

### 3. Filtro de canal na "Performance por Closer"

Adicionar acima do painel "Performance por Closer" um seletor com 3 opções:

- **Geral** (atual — todos os canais)
- **Social Selling**
- **Tráfego**

Ao trocar, recalcula vendas, reuniões realizadas, conversão e tíquete médio por closer considerando apenas agendamentos do canal selecionado (via `agendamentos.channel_type`). Mantém o ranking dinâmico para identificar qual closer performa melhor em cada canal.

A classificação Social Selling vs Tráfego seguirá o mesmo mapeamento já usado em `AgendasPorCanalPanel` / `DashboardComercialPage` (para manter consistência entre painéis).

## Arquivos afetados

- `src/components/dashboard/VendasTab.tsx` — card de % oferta, painel por produto, filtro de canal na Performance por Closer
- (Possível) pequeno helper para classificar canal em "Social Selling" vs "Tráfego", reutilizando lógica existente

Sem mudança de schema, sem nova migração, sem mexer no fluxo do `VendaDialog`.

## Pontos a confirmar

- "Realizadas" no denominador da % de oferta: considero status `realizada` + `comprou` (toda reunião que de fato aconteceu). OK?
- Mapeamento canal → Social Selling / Tráfego: usar exatamente o mesmo agrupamento já usado hoje no painel "Agendas por Canal"?
