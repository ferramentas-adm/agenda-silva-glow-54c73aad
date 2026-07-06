## Problema

O card **"Vendas registradas — Total subidas no período"** atribui cada venda à data em que a linha foi atualizada (`vendas.updated_at`). Quando o gestor edita manualmente a "Data da venda" (que grava `vendas.closed_at`), o `updated_at` passa a ser o momento da edição, então a venda continua "subindo" no dia da edição em vez do dia escolhido.

Foi o que aconteceu com a Tamiris Sousa: o card **Vendas Fechadas** (que já respeita `closed_at`) migrou para 02/07, mas o card **Total subidas no período** manteve a venda em 03/07.

## Correção

Fazer o card "Total subidas no período" respeitar a `closed_at` quando ela existir, exatamente como já faz o card "Vendas Fechadas". Se não houver `closed_at`, mantém o comportamento atual (data em que a venda foi registrada no sistema).

### Alterações em `src/components/dashboard/VendasTab.tsx`

1. **Query `vendas-uploaded-period`** (linhas ~241-266)
   - Selecionar também `closed_at`.
   - Trocar o filtro `updated_at BETWEEN ...` por um filtro `OR` que aceite a venda se `closed_at` estiver no período **ou** (na ausência de `closed_at`) o `updated_at` estiver no período. Isso garante que vendas com data editada para dentro/fora do período sejam incluídas/excluídas corretamente.
   - Retornar `closed_at` no shape do item.

2. **Filtro client-side (dentro de `VendasHojeCard`)**
   - Calcular a "data efetiva de subida" (BRT `yyyy-MM-dd`) como: `closed_at` se presente, senão `brDateOf(updated_at)`.
   - Manter apenas itens cuja data efetiva caia em `[periodFrom, periodTo]`. Isso corrige tanto falsos-positivos (edição moveu venda para outra data) quanto falsos-negativos (venda editada para dentro do período).

3. **Recalcular métricas derivadas** do card usando o mesmo conjunto filtrado (total, receita, "de call" vs "follow-up", "por closer"). Nenhuma outra tela é afetada.

### Detalhe técnico

- Comparação de datas continua em BRT via `brDateOf` (já usado no arquivo) para evitar deslocamento de fuso.
- A regra "De call (reunião no período)" continua comparando `scheduled_date` com o período — não muda.
- Nenhuma alteração no schema, RLS ou em outros cards (o "Vendas Fechadas" já usa `closingDateOf`, que respeita `closed_at`).
