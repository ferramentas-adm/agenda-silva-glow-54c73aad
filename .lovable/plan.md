## Objetivo

Vendas fechadas via follow-up devem aparecer na aba "Vendas" do dashboard no **dia em que o closer marcou Vendeu = sim**, e não mais no dia da reunião original.

## Diagnóstico

Hoje `src/components/dashboard/VendasTab.tsx` filtra cada venda usando `agendamentos.scheduled_date === dateStr`. Como follow-ups convertidos mantêm a `scheduled_date` da reunião original (08/05, 11/05, etc.), eles somem do dia em que foram efetivamente fechados.

Como distinguir uma venda "normal" de uma venda vinda de follow-up:
- **Venda normal:** `vendas.created_at` ≈ dia da reunião e `follow_up = false` desde sempre.
- **Venda de follow-up:** linha de `vendas` existe há dias com `follow_up = true, vendeu = false`; quando fecha, vira `follow_up = false, vendeu = true` e `updated_at` salta para o momento do fechamento. Existe pelo menos um registro em `audit_logs` com `entity_type = 'venda'`, `entity_id = agendamento_id` e `action in ('follow_up_atualizado','follow_up_editado')` anterior ao `updated_at` atual.

## Mudanças

### 1. Data efetiva de fechamento por venda

Em `VendasTab.tsx`, computar para cada venda uma `closing_date` (YYYY-MM-DD em America/Sao_Paulo, usando `src/lib/timezone.ts`):

- Buscar os `audit_logs` de follow-up daquela venda (uma query agregada por `agendamento_id`).
- Se a venda tem `vendeu = true` **e** existe algum log de `follow_up_atualizado`/`follow_up_editado` com `created_at < vendas.updated_at`: `closing_date = updated_at` convertido para BRT.
- Caso contrário: `closing_date = scheduled_date` (mantém comportamento atual para vendas normais).

### 2. Trocar o filtro do dia

Substituir o filtro atual:

```
ag.scheduled_date === dateStr
```

por:

```
v.closing_date === dateStr   // ou between rangeFromStr/rangeToStr
```

Isso afeta:
- `vendasDia` (e por consequência `totalVendas`, `totalNaoFechou`, `coletadoTotal`, `taxaConversao`, motivos de não fechamento, performance por closer, drilldowns `fechadasIds` / `naoFechouIds`).
- `vendasDiaParaMotivos` segue a mesma regra.
- Follow-ups ativos/atrasados/hoje continuam usando `follow_up_date` como hoje (não mexer).

Importante: vendas com `vendeu = false` continuam sendo contabilizadas pelo `scheduled_date` da reunião (ou seja, "não fechou" segue ligado ao dia da reunião). Apenas as vendas fechadas via follow-up migram para o dia do fechamento.

### 3. Refletir no MetricDrilldownDialog

`MetricDrilldownDialog` recebe `ids` de `agendamento_id`. Como uma venda de follow-up agora aparece num dia diferente da reunião original, o card de drilldown deve continuar mostrando a data/hora da reunião original (já é o comportamento atual via `scheduled_date` + `scheduled_time`). Nada a alterar aqui.

### 4. Validação manual

Após aplicar, conferir que:
- Hoje (19/05) aparece a venda do **Samuel Freitas** (R$ 40.000 — André Lucchesi) junto com o CAIO DEVECCHI.
- Ontem (18/05) aparece a venda da **Alexsandra Machado** (R$ 10.000 — Igor Occon).
- Vendas normais não duplicam nem somem.

## Fora de escopo

- Não mexer no banco (sem novas colunas/migrations).
- Não alterar a aba de Follow-ups, métricas de SDR, ou webhooks DataCrazy.
- Não mexer no comportamento de "não fechou" / motivos para vendas que continuam em follow-up.
