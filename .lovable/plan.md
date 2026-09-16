# Lead desqualificado só conta quando vira venda

## Regra nova (vale para hoje e para todo o histórico)

Venda, aqui, é **reunião realizada com pagamento coletado** — qualquer valor coletado serve. Registro de venda sem valor coletado não é venda para efeito dessa regra.

Reunião de lead desqualificado:
- **Virou venda com pagamento coletado** → conta normalmente, em todos os cards de métricas e de vendas.
- **Sem pagamento coletado** (não fechou, no-show, cancelada, em aberto, ou marcada como vendida mas sem valor coletado) → não conta em nada.

Como os números são calculados a partir dos dados a cada acesso, a regra passa a valer automaticamente para todos os dias passados — não é preciso corrigir registro por registro.

## O que muda na tela

### Métricas SDRs (Dashboard Comercial)
Hoje os desqualificados estão fora de tudo. Passam a entrar apenas quando houve venda, somando em: total do dia, ontem/amanhã, total do mês, Agendadas, Confirmadas, Realizadas, Canceladas, No-shows, taxa de comparecimento, painéis por canal e produtividade por SDR.

Exemplo de hoje (16/09): 97 realizadas no total, 27 de desqualificados. Se, digamos, 6 dessas 27 fecharam venda, "Realizadas" em Métricas SDRs passa de 70 para 76.

### Vendas (Dashboard Comercial)
Hoje a Taxa de Conversão conta todas as reuniões realizadas. Passa a descartar as reuniões de desqualificados que não venderam — o denominador cai, e a conversão passa a refletir só o esforço que conta. Vendas de desqualificado continuam contando no faturamento, nos motivos, no ranking de closers e nas tendências.

O card "Vendas Fechadas (desqualificados)" continua como está — ele é justamente o recorte dessas vendas.

### Calendário (/dashboard)
Sem mudança: continua mostrando e contando todas as reuniões do dia, inclusive as de desqualificados que não venderam. É a tela operacional do dia — esconder reunião real ali atrapalharia o acompanhamento. Se preferir aplicar a regra lá também, é só dizer.

## Detalhes técnicos

Predicado único de "conta na métrica":

```text
not lead_desqualificado
OR exists (venda do agendamento com vendeu = true e valor coletado > 0)
```

O valor coletado é `vendas.valor` (o valor efetivamente coletado; `valor_total_projeto` é o faturado). Qualquer valor acima de zero satisfaz a regra; `null` ou `0` não.

Frontend (`src/pages/DashboardComercialPage.tsx`):
- O `soldSet` já existente passa a ser carregado a partir do pool completo de agendamentos do período (incluindo desqualificados) e a filtrar `vendeu = true` **e** `valor > 0`.
- Trocar `.filter(a => !a.lead_desqualificado)` na linha do `sdrAgs` por `.filter(a => !a.lead_desqualificado || soldSet.has(a.id))`.
- Ajustar as dependências do `useMemo` de `metrics` para incluir `soldSet`; nenhuma mudança em `src/lib/agendaMetrics.ts`.
- Verificar se `soldValueMap` (usado em valores por canal) deve seguir o mesmo corte de `valor > 0` para não divergir.

Banco — migração de RPCs, aplicando o mesmo predicado ao lado de `deleted_at is null`:
- `dashboard_conversao_period` — na CTE `ags` (afeta reuniões e conversão).
- `dashboard_vendas_kpis`, `dashboard_vendas_closer_perf`, `dashboard_vendas_motivos`, `dashboard_vendas_realizadas_sem_closer` — nas contagens de realizadas.
- `dashboard_agendas_por_canal`, `dashboard_agendamentos_por_booking_channel`, `dashboard_trend_sdr`, `dashboard_trend_vendas` — mesmo predicado nas contagens de agendamentos/realizadas.
- `dashboard_agendas_por_canal`, `dashboard_agendamentos_por_booking_channel`, `dashboard_trend_sdr`, `dashboard_trend_vendas` — mesmo predicado nas contagens de agendamentos/realizadas.

Implementado como função auxiliar `public.agendamento_conta_metrica(_agendamento_id uuid, _lead_desqualificado boolean)` (`stable`, `security definer`, `search_path = public`) ou como `exists (select 1 from vendas ...)` inline, o que der melhor plano; as RPCs de período são sensíveis a performance, então a versão final usa uma CTE materializada de agendamentos vendidos em vez de subconsulta por linha.

Nenhuma alteração em endpoints `silva-*`, CRM, CAPI, regras de turma/capacidade ou na gravação de agendamentos.
