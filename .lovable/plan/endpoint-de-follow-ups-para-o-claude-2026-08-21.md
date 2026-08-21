# Endpoint de Follow-ups para o Claude

Novo endpoint público-autenticado por chave (`x-api-key`), no mesmo padrão do `silva-vendas`, expondo todos os dados da página "Follow-ups".

## O que o endpoint entrega

`GET /silva-followups`

Retorna dois blocos, exatamente como as duas abas da página:

1. `em_acompanhamento` — follow-ups ativos (venda ainda não fechada, com data de follow-up agendada)
2. `nao_acompanhados` — reuniões não fechadas e sem follow-up marcado

Por item: closer (nome/email), lead (nome/whatsapp), data e hora da reunião original, data e hora do follow-up, motivo do não fechamento, explicação, observações, valor previsto, se está atrasado (`atrasado: true/false` comparando com hoje em America/Sao_Paulo), `agendamento_id` e `venda_id`.

Resumo no topo da resposta: total em acompanhamento, total atrasados, total de hoje, total não acompanhados, valor total em pipeline e `sincronizado_em`.

## Filtros por query string

- `bloco=em_acompanhamento | nao_acompanhados | todos` (padrão `todos`)
- `from` / `to` (YYYY-MM-DD) — recorta pela data do follow-up (ou pela data da reunião no bloco de não acompanhados)
- `closer` — nome do closer (match parcial)
- `motivo` — motivo do não fechamento
- `atrasados=true` — só os vencidos
- `limit` — teto de itens por bloco

## Autenticação

Header `x-api-key` com um segredo novo (`SILVA_FOLLOWUPS_API_KEY`), gerado no backend. Eu te passo a chave e a URL completa prontas para colar no Claude.

## Detalhes técnicos

- Nova edge function `supabase/functions/silva-followups/index.ts`, usando service role e `Deno.serve`, CORS igual ao `silva-vendas`, apenas GET (405 nos demais), 401 quando a chave não bate.
- Consultas em `vendas` com `agendamentos!inner (... closers(name,email))`, filtrando `vendeu = false`; `follow_up = true` para o bloco 1 e `follow_up = false` para o bloco 2. Registros com `agendamentos.deleted_at` são descartados (mesma regra da UI).
- Datas formatadas em dd/MM/yyyy, além do campo ISO cru para o Claude calcular.
- `supabase/config.toml`: bloco `[functions.silva-followups]` com `verify_jwt = false` (auth é via `x-api-key`).
- Nenhuma mudança de schema; endpoint somente leitura.
