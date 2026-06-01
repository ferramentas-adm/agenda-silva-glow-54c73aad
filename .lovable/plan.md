## Objetivo

Enriquecer o payload do webhook `notify_status_change_webhook` (quando `status = 'realizada'`) com **todos os campos da venda atual**, lendo da tabela `vendas` via `agendamento_id = NEW.id`.

## O que muda

Apenas a function PL/pgSQL `notify_status_change_webhook` (via migration).

No bloco que já busca `vendas` para calcular `is_vendido/is_follow_up/is_perdido`, expandir o SELECT para trazer todos os campos relevantes e incluí-los no `jsonb_build_object` final — sobrescrevendo (apenas neste caso de `realizada`) os valores hoje calculados só para INSERT de 2ª reunião.

### Campos novos/preenchidos no payload quando `status = 'realizada'`

Lidos de `public.vendas` onde `agendamento_id = NEW.id`:

| Chave no payload | Coluna em `vendas` |
|---|---|
| `vendeu` | `vendeu` |
| `valor_coletado` | `valor` (quando `vendeu = true`) |
| `resumo_venda` | `resumo_venda` |
| `motivo_nao_fechamento` | `motivo_nao_fechamento` |
| `explicacao_nao_fechamento` | `explicacao_nao_fechamento` |
| `valor_apresentado` | `valor` (quando `vendeu = false`) — atual lógica de 2ª reunião usa `v.valor` como apresentado |
| `lead_revenue` | `lead_revenue` |
| `follow_up_date` | `follow_up_date` |
| `follow_up_time` | `follow_up_time` |
| `observacoes` | `observacoes` |

Mantidas as flags `is_vendido / is_follow_up / is_perdido` (sem mudança de regra).

### O que NÃO muda

- Campo `erro_sdr` (sdr_error): **não enviar** (conforme decisão).
- `is_segunda_reuniao` e enriquecimento de INSERT de 2ª reunião (que já lê da venda da reunião **original**): permanecem como hoje.
- `status` continua sendo `"Realizada"`.
- Nenhuma mudança em frontend, edge functions ou outras tabelas.

### Detalhe técnico

Hoje a function tem dois blocos separados:
1. INSERT de 2ª reunião → lê venda da reunião **original** e preenche `_lead_revenue`, `_motivo_nao_fechamento`, `_explicacao_nao_fechamento`, `_valor_apresentado`.
2. `status = 'realizada'` → lê venda **atual** só para calcular flags.

O plano é, no bloco (2), expandir o SELECT para também popular as variáveis locais (`_lead_revenue`, `_motivo_nao_fechamento`, `_explicacao_nao_fechamento`, `_valor_apresentado`) com os dados da venda atual, e adicionar três novas variáveis (`_valor_coletado`, `_resumo_venda`, `_follow_up_date`, `_follow_up_time`, `_observacoes`) que entram no `jsonb_build_object`. Os blocos (1) e (2) são mutuamente exclusivos na prática (INSERT vs UPDATE para realizada), então não há conflito.
