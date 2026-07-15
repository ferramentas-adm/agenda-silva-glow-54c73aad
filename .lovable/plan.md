# Corrigir sugestão de horários mais vazios

## Problema
O 13h tem menos reuniões marcadas que o 19h, mas o sistema sugere o 19h. Motivo: hoje o cálculo exige que o horário tenha **pelo menos metade da capacidade máxima do dia livre** para ser considerado "vazio". Se o 13h já tem várias marcações e sobra pouca vaga, ele é descartado — mesmo tendo, proporcionalmente, mais espaço que o 19h em termos absolutos de ocupação percebida pelo SDR.

## O que muda
- Remover o corte `minRemaining` (metade da capacidade máxima).
- Ordenar todos os slots dentro do horário comercial (HH:00) que **não estão lotados** e têm capacidade > 0 pelo maior número de vagas livres.
- Pegar os 6 mais vazios e reexibir em ordem cronológica, como já é hoje.

Efeito: o 13h, com mais vagas restantes que o 19h, passa a aparecer na frente.

## Onde
- `src/pages/DashboardPage.tsx`, dentro do memo `slotAlerts` (a lógica atual está logo depois do `useQuery` de `closers-active-hours`).

## Fora do escopo
- Banner de "lotado" e horário comercial (10–21, HH:00) continuam iguais.
- Nada de backend, RLS ou tipos.
