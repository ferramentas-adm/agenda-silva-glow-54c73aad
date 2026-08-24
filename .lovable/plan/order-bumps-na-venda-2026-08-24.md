# Order bumps na venda

## Como fica

**Nos dois modais** (closer "Resultado da Reunião" e gestor "Lançar venda"), quando a resposta é **Vendeu = Sim**, aparece um bloco novo:

```text
Order bumps (opcional)
[ ] Extensão de acesso 6 meses — R$ 3.000,00
[ ] Grupo VIP — R$ 2.000,00
```

- Checkboxes: pode marcar **nenhum, um ou os dois**.
- **Não soma nada** no "Valor coletado" — o valor do bump já está dentro do valor total. Os bumps são registrados apenas como informação/etiqueta da venda.
- Ao reabrir o modal de uma venda já lançada, os bumps marcados vêm preenchidos e podem ser alterados.
- No modal do closer o bloco só aparece com "Vendeu? = Sim"; no do gestor aparece sempre (o modal do gestor já é sempre uma venda).

**Configuração em Administração > +Listas**: nova lista **"Order bumps"**, onde o gestor cadastra/edita/remove bumps com nome e valor. Os dois atuais (Extensão de acesso 6 meses R$ 3.000,00 e Grupo VIP R$ 2.000,00) ficam como padrão inicial.

**Onde os bumps ficam visíveis depois**: no detalhe da venda (aba Vendas do dashboard) e no endpoint `silva-vendas` usado pelo Claude, como lista de nomes + valores.

## Detalhes técnicos

- Migração: `ALTER TABLE public.vendas ADD COLUMN order_bumps jsonb` (nullable, default `null`) — array de `{ "nome": string, "valor": number }`. Sem mudança de policies/grants.
- `src/hooks/useAppSettingList.ts`: nova chave `order_bumps` em `APP_SETTING_KEYS` + label "Order bumps". A lista continua sendo array de strings; formato do item: `Nome|3000` (nome e valor em centavos-livres separados por `|`).
- Novo `src/lib/orderBumps.ts`: `parseOrderBump(raw)` → `{ nome, valor }`, `formatOrderBump({nome,valor})` → string de armazenamento, `formatOrderBumpLabel` → `"Nome — R$ 3.000,00"`, e `DEFAULT_ORDER_BUMPS = ["Extensão de acesso 6 meses|3000", "Grupo VIP|2000"]` usados como defaults do hook.
- Novo `src/components/OrderBumpsField.tsx`: bloco reutilizável com `useAppSettingList(APP_SETTING_KEYS.order_bumps, DEFAULT_ORDER_BUMPS)`, checkboxes shadcn, props `value: {nome,valor}[]` / `onChange`. Não renderiza nada se a lista estiver vazia.
- `src/components/VendaDialog.tsx`: estado `orderBumps`, render do campo quando `vendeuCloser === "sim"`, hidratação a partir de `vendas.order_bumps` no fetch existente, e `order_bumps: orderBumps.length ? orderBumps : null` no insert/update.
- `src/components/dashboard/GestorVendaDialog.tsx`: mesmo estado/campo (sempre visível), hidratado do `existing.order_bumps`, gravado no insert e no update; no `handleRemove`, zera `order_bumps: null` junto com os demais campos.
- `src/components/DynamicListManager.tsx`: suporte a itens nome+valor apenas para a chave `order_bumps` — dois inputs (nome e valor em R$) ao adicionar/editar, exibindo o rótulo formatado na listagem; demais listas seguem exatamente como hoje.
- `src/components/dashboard/VendasTab.tsx`: incluir `order_bumps` no select e exibir os nomes como badges na linha/detalhe da venda.
- `supabase/functions/silva-vendas/index.ts`: incluir `order_bumps` no select e no payload (`order_bumps: [{nome, valor}]` + `order_bumps_total`).
- Métricas e conversão não mudam — nenhum valor de bump é somado a `valor`.
