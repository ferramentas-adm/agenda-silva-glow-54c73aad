## Objetivo
Simplificar o card **"Tendência de vendas e conversão"** para mostrar só a taxa de conversão diária + uma linha de tendência (subindo/descendo) sobre os últimos N dias selecionados.

## Mudanças

### 1. `src/components/dashboard/TrendCardVendas.tsx`
- Manter a query atual (agendamentos realizados + vendas no período).
- Reduzir o dataset a uma única série: `conversao` (já calculada hoje como `vendas / realizadas * 100`).
- Remover as séries `vendas` e `faturamento` do `series` passado ao `TrendChart`.
- `primaryKey = "conversao"`.

### 2. `src/components/dashboard/TrendChart.tsx`
- Adicionar prop opcional `showTrendline?: boolean` (default `false`).
- Quando `true`: calcular uma **regressão linear simples** sobre a série primária (`y = a*x + b`, x = índice do dia) e desenhar como uma `Line` reta tracejada sobrepondo o gráfico — cor neutra, sem dots, label "Tendência".
- Adicionar prop opcional `showComparison?: boolean` (default `true`). Quando `false`:
  - Não renderiza o badge de "−X% (Nd vs Nd)".
  - Não renderiza o alerta amarelo de queda.
- No card de Vendas, passar `showTrendline={true}` e `showComparison={false}`.
- Remover a média móvel quando `showTrendline` estiver ativo (evita poluir o gráfico — a linha de tendência já cumpre o papel).
- Remover o eixo Y direito (não precisa mais, só uma série).

### 3. Comportamento da janela
- Já está correto: `7d/15d/30d/60d/90d` → últimos N dias exibidos. Sem ajustes.

## Fora de escopo
- O card **TrendCardSDR** (criadas vs realizadas) fica como está.
- Drill-down, exports, novos filtros.

## Detalhes técnicos da linha de tendência
- Função local em `TrendChart`:
  ```
  const n = values.length;
  const sx = soma(0..n-1); sy = soma(values);
  const sxx = soma(i*i); sxy = soma(i*values[i]);
  const a = (n*sxy - sx*sy) / (n*sxx - sx*sx);
  const b = (sy - a*sx) / n;
  trendline[i] = a*i + b;
  ```
- Anexa ao dataset enriquecido como `__trend` e renderiza como `Line` tracejada (`strokeDasharray="6 4"`, `strokeWidth=2`).
- Cor: verde se `a > 0`, vermelho se `a < 0`, neutra se `a ≈ 0`.
