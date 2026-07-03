## Diagnóstico

Sim, entendi exatamente. Hoje a aba **Vendas** (`src/components/dashboard/VendasTab.tsx`) atribui vendas fechadas ao dia em que o closer subiu a venda (`updated_at` em BRT), ignorando o campo **"Data da venda"** (`vendas.closed_at`) — que é justamente o override manual editado no card do lead (ícone de lápis) via `MetricDrilldownDialog`.

Trecho responsável (linhas 334-349 de `VendasTab.tsx`):

```ts
if (v.vendeu) {
  // Data em que a venda foi subida (BRT).
  return inRangeYmd(brDateOf(v.updated_at));   // ← ignora closed_at
}
const cd = closingDateOf(v);
return inRangeYmd(cd);
```

Por isso a venda da Tamiris, editada para **02/07**, continua caindo em **03/07** (dia do upload).

Outros pontos do arquivo (motivos de não fechamento, drilldowns) já usam `closingDateOf`, que respeita `closed_at`. Fora daí, `closed_at` é usado corretamente em `AgendasPorCanalPanel`, `MetricDrilldownDialog` e no CSV.

## Mudança proposta

Em `src/components/dashboard/VendasTab.tsx`, no branch `v.vendeu` do `vendasDia`:

- Se o usuário editou `closed_at`, usar essa data.
- Caso contrário, manter o comportamento atual (data em que a venda foi subida — `brDateOf(v.updated_at)`).

Ou seja, trocar:

```ts
if (v.vendeu) {
  return inRangeYmd(brDateOf(v.updated_at));
}
```

por:

```ts
if (v.vendeu) {
  const effective = v.closed_at ?? brDateOf(v.updated_at);
  return inRangeYmd(effective);
}
```

## Efeito

- Venda subida hoje sem edição → continua contabilizada hoje (nada muda no fluxo normal).
- Venda cuja "Data da venda" foi editada para outro dia → passa a contar no dia escolhido, em todos os cards da aba Vendas (Total de vendas, Coletado, Faturado, %1ª call/Follow, drilldowns).
- Fora do escopo: painéis de "Métricas" do Dashboard Comercial que contam vendas pelo `scheduled_date` do agendamento não são afetados — se você quiser que esses também respeitem `closed_at`, me diga que amplio o escopo.

## Validação

- Recarregar a aba Vendas no dia **02/07** com filtro no closer da Tamiris: a venda de R$ 10.000 deve aparecer.
- No dia **03/07**: a venda não deve mais aparecer.
- Rodar `tsgo` para garantir que não quebrou tipos.
