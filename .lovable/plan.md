## Objetivo

Dar aos gestores visão preditiva: identificar quedas em agendamentos, conversões e vendas antes que virem problema. Para isso, adiciono painéis de **tendência temporal** nas abas **Produtividade SDR** e **Vendas**, com séries históricas, média móvel e sinalização visual de queda.

## O que será adicionado

### 1. Aba Produtividade SDR (`ProdutividadeSDRTab.tsx`)
Novo card **"Tendência de agendamentos"** logo abaixo dos cards de KPIs, antes do gráfico de barras já existente.

- **Gráfico de linhas (LineChart recharts)** com séries diárias dos últimos **30 dias** (independente do filtro de dia escolhido — janela rolante para análise de tendência):
  - Agendamentos criados/dia
  - Reuniões realizadas/dia
  - Linha tracejada de **média móvel de 7 dias** sobreposta (suaviza ruído)
- **Badge de variação** no canto do card: comparação dos últimos 7 dias vs. 7 dias anteriores (`▲ +12%` verde / `▼ -18%` vermelho).
- Toggle "30d / 60d / 90d" para ajustar a janela.

### 2. Aba Vendas (`VendasTab.tsx`)
Novo card **"Tendência de vendas e conversão"** abaixo dos KPIs principais.

- **Gráfico combinado (ComposedChart)** com janela rolante padrão de 30 dias:
  - Barras: vendas fechadas/dia (R$)
  - Linha: taxa de conversão diária (vendas / reuniões realizadas, em %)
  - Linha tracejada: média móvel 7d da taxa de conversão
- **3 mini-badges** de variação 7d vs 7d anteriores: nº vendas, faturamento, taxa de conversão.
- Toggle "30d / 60d / 90d".

### 3. Sinalização preditiva
Em ambos os cards, quando a média móvel atual ficar **≥15% abaixo** da média móvel de 7 dias atrás, mostro um alerta sutil (banner amarelo dentro do card): *"Tendência de queda detectada nos últimos 7 dias"* — assim o gestor age cedo.

## Detalhes técnicos

- **Fonte de dados**: reaproveito `agendamentos` e `vendas` já carregados pela página pai (props existentes). Para a janela de 30/60/90d preciso garantir que o range carregado cubra a janela do gráfico — se hoje o pai só envia o dia atual, adiciono uma query própria dentro de cada componente buscando os últimos N dias por `created_at` (agendamentos) e `agendamentos.scheduled_date` (vendas), com filtros existentes (closer/SDR).
- **Timezone**: agrego por dia usando os helpers de `src/lib/timezone.ts` (regra core do projeto: America/Sao_Paulo).
- **Cores**: tokens semânticos do design system (`hsl(var(--primary))`, `--destructive`, `--muted-foreground`) — sem cores hardcoded. Reutilizo `ChartContainer` / `ChartTooltip` de `src/components/ui/chart.tsx` para coerência visual.
- **Performance**: agregação em `useMemo`; janela máxima 90 dias.
- **Visibilidade**: apenas para perfis gestor/moderador (mesma regra já aplicada às abas).

## Fora do escopo

- Previsão estatística avançada (ARIMA/ML) — fica para depois; agora entregamos média móvel + variação % + alerta de queda, que já cobre a necessidade descrita.
- Alterações em lógica de agendamento, cálculo de KPIs existentes ou schema do banco.
