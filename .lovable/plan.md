# Ajuste: endpoint de follow-ups usa a chave do silva-vendas

O endpoint `silva-followups` já está criado e no ar. Falta apenas trocar a autenticação.

## O que muda

- O endpoint passa a aceitar a chave que você já usa no `silva-vendas` (`SILVA_VENDAS_API_KEY`), no header `x-api-key`. Assim você não precisa guardar nenhuma chave nova.
- Remoção do segredo `SILVA_FOLLOWUPS_API_KEY`, que não será mais usado.
- Nenhuma alteração de dados, tabelas ou telas do painel.

## Depois disso

Você usa no Claude:

`GET https://<seu-endpoint>/silva-followups` com header `x-api-key: <mesma chave do silva-vendas>`

Filtros disponíveis: `bloco`, `from`, `to`, `closer`, `motivo`, `atrasados`, `limit`.

## Detalhes técnicos

- Em `supabase/functions/silva-followups/index.ts`: substituir `Deno.env.get("SILVA_FOLLOWUPS_API_KEY")` por `Deno.env.get("SILVA_VENDAS_API_KEY")` e redeploy da função.
- Apagar o segredo `SILVA_FOLLOWUPS_API_KEY` (criado hoje, sem uso em nenhum outro lugar).
