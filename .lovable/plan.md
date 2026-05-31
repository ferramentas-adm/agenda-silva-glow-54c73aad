## Ajuste de dados — Luiz Construtora chalés (30/05/2026 16:00)

Agendamento: `24ac80fc-1d4a-4566-9066-2bffb73b9c74` (closer Pedro Ferro).

### 1. Atualizar venda existente (`1f73e54d-2ae2-4e55-afbc-f93d79e3f70d`)
- `vendeu` → `true`
- `valor` (apresentado) → mantém **R$ 40.000,00**
- `closed_at` → **2026-05-30**
- `follow_up` → `false`, `follow_up_date` e `follow_up_time` → `null`
- `motivo_nao_fechamento` e `explicacao_nao_fechamento` → `null`
- `observacoes` → mantém

### 2. Criar pagamento
- `cliente_nome`: "Luiz Construtora chalés"
- `cliente_telefone`: +55 (35) 99940-6338
- `valor_previsto`: 700,00
- `valor_realizado`: 700,00
- `valor_apresentado`: 40.000,00
- `data_prevista`: 2026-05-30
- `data_pagamento`: 2026-05-30
- `status`: `pago`
- `closer_id`: Pedro Ferro (`58cb7503-…`)
- `agendamento_id` e `venda_id` vinculados
- `created_by`: o gestor que está executando (mesmo `created_by` da venda original)

Ambas as operações via tool `supabase--insert` (UPDATE + INSERT).
