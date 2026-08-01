# Origem da venda: 1ª call vs follow-up

## O que muda

1. **Modal "Resultado da Reunião"** — quando o closer marca **Vendeu? Sim**, aparece um novo campo obrigatório:
   - `Origem da venda *` com duas opções: **Venda na 1ª call** | **Venda de follow-up / 2ª reunião**
   - Fica logo abaixo do "Vendeu?", antes de valor/produto.
   - Ao editar uma venda já registrada, o campo vem pré-selecionado com o valor salvo (ou, se for venda antiga sem o campo, com o palpite atual baseado na data da reunião).

2. **Card "Vendas registradas"** (dashboard) — os quadros "De call" e "De follow-up / 2ª reunião" passam a contar pelo que o closer marcou no modal.
   - Vendas com origem marcada: usa a marcação.
   - Vendas antigas (sem marcação): mantém a regra atual (reunião no período e sem follow-up/2ª = call), para não alterar o histórico.
   - Legendas dos quadros ajustadas para "Marcado pelo closer".

## Detalhes técnicos

- Migração: nova coluna `vendas.venda_origem text` (nullable, check em `('primeira_call','follow_up')`). Nullable de propósito: registros anteriores ficam sem valor e caem no fallback.
- `src/components/VendaDialog.tsx`: novo estado `vendaOrigem`, incluído na validação (`valid`) quando `vendeu === "sim"`, gravado no `upsert` de `vendas` e no payload do webhook DataCrazy (`venda_origem`).
- `src/services/datacrazyVenda.ts`: campo opcional `venda_origem` na interface do payload.
- `src/components/dashboard/VendasTab.tsx`: `VendaHojeItem` ganha `venda_origem`; o select da query passa a buscar a coluna; `isFollow` vira: se `venda_origem` existir, `=== "follow_up"`; senão heurística atual.
- Taxa de Conversão e a RPC `dashboard_conversao_period` **não** mudam neste escopo.
