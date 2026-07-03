## Objetivo
Expor as vendas do sistema via endpoint autenticado por API key, para consumo externo.

## Componentes

### 1. Edge Function `silva-vendas`
Arquivo: `supabase/functions/silva-vendas/index.ts`

- Método: `GET` + `OPTIONS` (CORS preflight)
- CORS aberto: `*`, headers `authorization, x-api-key, content-type`, métodos `GET, OPTIONS`
- Auth: valida header `X-API-KEY` contra `Deno.env.get("SILVA_VENDAS_API_KEY")`. Não bateu → 401.
- Query params:
  - `since` (YYYY-MM-DD) → filtra `agendamentos.scheduled_date >= since`
  - `vendeu` (`true`/`false`, default `true`)
  - `limit` (número, default sem limite)
- Cliente Supabase criado com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS)
- Query: `vendas` com `select` aninhado de `agendamentos(...,closers(name,email))`, ordenada por `created_at desc`
- Mapeia cada linha para o formato pedido:
  - `data`: converte `agendamentos.scheduled_date` de YYYY-MM-DD para DD/MM/YYYY; se null, usa `venda.created_at` (também DD/MM/YYYY)
  - `hora_reuniao`: `agendamentos.scheduled_time` (HH:mm)
  - Campos diretos: `valor`, `valor_total_projeto`, `is_venda_avulsa` (do agendamento), `is_5k` (do agendamento), `produto`, `resumo_venda`, `segunda_reuniao`, `follow_up`, `motivo_nao_fechamento`, `agendamento_id`
  - `closer` / `closer_email`: via join
- `total_faturado`: soma de `valor_total_projeto ?? valor ?? 0`
- Resposta:
  ```json
  { "count", "total_faturado", "sincronizado_em": <ISO>, "vendas": [...] }
  ```

### 2. Config
Adicionar em `supabase/config.toml`:
```
[functions.silva-vendas]
verify_jwt = false
```
(a auth é via X-API-KEY, não JWT)

### 3. Secret
Registrar `SILVA_VENDAS_API_KEY = hXLlm0GLvWDGHUA_UAJJTQlC6Dd96GaEmDLzbMhxraw` via `set_secret` (valor já conhecido, sem formulário).

⚠️ Observação: enviar uma API key em texto no chat é considerado exposição. Recomendo trocá-la depois. Posso rotacionar quando quiser.

### 4. Deploy + teste
- Deploy da função via `deploy_edge_functions`
- Teste com curl:
  ```
  curl -H "X-API-KEY: <key>" \
       "https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/silva-vendas?limit=3"
  ```

## URL final
`https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/silva-vendas`

Aprova pra eu implementar?
