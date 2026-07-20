# Ajuste no endpoint `silva-reunioes`

Objetivo: permitir que o Claude (ou qualquer cliente) filtre por status das reuniões (ex.: só "realizada") e enxergue o status no payload.

## Mudanças em `supabase/functions/silva-reunioes/index.ts`

1. Incluir `status` no `select` da query.
2. Ler novo query param `?status=` (aceita lista separada por vírgula: `realizada`, `agendada,confirmada`, etc.). Se vazio, mantém comportamento atual (retorna todos).
3. Aplicar `.in("status", [...])` quando o param vier preenchido.
4. Adicionar campo `status` no objeto de cada reunião retornado.

## Deploy

Rodar `supabase--deploy_edge_functions` para `silva-reunioes`.

## Como usar depois

- Todas realizadas dos últimos 30 dias:
  `GET /functions/v1/silva-reunioes?status=realizada&since=2026-06-20`
- Realizadas + canceladas:
  `GET /functions/v1/silva-reunioes?status=realizada,cancelada`
- Prompt sugerido pro Claude:
  > "Use a ferramenta HTTP GET em `https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/silva-reunioes?status=realizada&since=YYYY-MM-DD` com header `x-api-key: <SILVA_VENDAS_API_KEY>` para listar as reuniões realizadas no período."

## Fora do escopo

- Não altera autenticação, payload dos webhooks, nem outras funções.
- Não muda o formato de `data`/`hora_reuniao` já retornados.
