## Objetivo

Adicionar 3 novos flags ao payload do **webhook único de agendamento** (function `notify_status_change_webhook`), no mesmo padrão do `is_segunda_reuniao` que já existe. Os flags são derivados da tabela `vendas` quando o agendamento vira `realizada`.

## Novos campos no payload

| Campo | `true` quando… | Caso contrário |
|---|---|---|
| `is_vendido` | venda existe e `vendas.vendeu = true` | `null` |
| `is_follow_up` | venda existe, `vendeu = false` e `follow_up = true` | `null` |
| `is_perdido` | venda existe, `vendeu = false`, `follow_up = false`, `segunda_reuniao = false` e motivo **não** é etapa em andamento ("Aguardando o pagamento" / "Analisando o contrato") | `null` |

Convenção idêntica ao `is_segunda_reuniao`: enviar `true` ou `null` (nunca `false`) — só aparecem preenchidos quando aplicáveis e são mutuamente exclusivos.

## Onde alterar

Apenas a function PL/pgSQL **`notify_status_change_webhook`** (via migration).

1. No bloco que já busca dados da `vendas` para enriquecimento (hoje só roda para INSERT de 2ª reunião), passar a buscar a venda **também quando `NEW.status = 'realizada'`** — usando `NEW.id` como `agendamento_id`.
2. Calcular três variáveis locais `_is_vendido`, `_is_follow_up`, `_is_perdido` (`BOOLEAN`, default `NULL`) a partir dos campos `vendeu`, `follow_up`, `segunda_reuniao`, `motivo_nao_fechamento` da venda encontrada.
3. Incluir as três chaves no `jsonb_build_object(...)` final, ao lado de `is_segunda_reuniao`.

## O que NÃO muda

- O `status` segue derivado igual (continua `"Realizada"` no caso).
- `is_segunda_reuniao` e demais campos do payload permanecem inalterados.
- Edge function `datacrazy-venda-webhook` e o serviço `sendVendaToDataCrazy` no frontend não são tocados nesta tarefa (se quiser, em seguida posso remover essa rota duplicada — me avise).
- Nenhuma mudança no frontend nem em outras tabelas.