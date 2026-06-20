# Calendário estilo Facebook Ads

Criar um seletor de período rico (igual ao print) e usar nos dois dashboards: Comercial e Leads.

## Componente novo

`src/components/FacebookDateRangePicker.tsx` — Popover com:

**Coluna esquerda — Presets** (radio list, em PT-BR, fuso America/Sao_Paulo):
- Hoje
- Ontem
- Hoje e ontem
- Últimos 7 dias
- Últimos 14 dias
- Últimos 28 dias
- Últimos 30 dias
- Esta semana (seg–dom)
- Semana passada
- Este mês
- Mês passado

Seção "Usados recentemente" no topo: até 3 últimos presets escolhidos (persistidos em `localStorage`, chave `fb-date-presets-recent`).

**Painel direito — Calendário duplo**:
- Dois meses lado a lado (`react-day-picker` com `numberOfMonths={2}`, `mode="range"`, locale `ptBR`, semana começando segunda).
- Selects de mês/ano em cada cabeçalho (navegação rápida estilo print) — overrides via `components.Caption` customizado usando `Select` shadcn.
- Dias fora do range em cinza, dia selecionado em azul primário, hover azul claro.

**Linha inferior**:
- Checkbox "Comparar" → quando ligado revela: dropdown ("Período anterior", "Ano anterior", "Personalizado") + dois inputs de data.
- Dropdown principal com o preset atual + dois campos read-only "DD de mês" mostrando from/to.
- Texto cinza: "Fuso horário das datas: Horário de São Paulo".
- Botões `Cancelar` e `Atualizar` (primário). Estado só é commitado ao clicar Atualizar.

**API**:
```ts
type Period = { from: Date; to: Date; presetKey?: string };
type Comparison = { from: Date; to: Date; mode: "previous" | "year" | "custom" };
interface Props {
  value: Period;
  comparison?: Comparison | null;
  onChange: (period: Period, comparison: Comparison | null) => void;
  align?: "start" | "end";
}
```

Trigger: botão outline mostrando `"20 jun 2026 – 20 jun 2026"` + ícone calendário (igual hoje, mas usando o novo popover).

## Integração

**`src/pages/DashboardComercialPage.tsx`**
- Substituir o atual `Popover + Calendar` por `<FacebookDateRangePicker />`.
- Adicionar estado `comparison`. Quando ativo, refazer queries de KPIs principais para o período de comparação e exibir delta % ao lado dos números (badge verde/vermelho).
- Início (semana atual: 15–19/jun) deixa de ser hardcoded — default = "Este mês".

**`src/pages/DashboardLeadsPage.tsx`**
- Mesma substituição.
- Comparação: nos cards de totais (leads iniciados, finalizados, taxa) mostrar delta vs período comparado. Gráfico de linha ganha série tracejada com o período de comparação.

## Detalhes técnicos

- Datas sempre em America/Sao_Paulo via helpers de `src/lib/timezone.ts` (regra do projeto). `from` = 00:00 BRT, `to` = 23:59:59 BRT antes de enviar para Supabase.
- Cálculo de comparação:
  - `previous`: mesmo número de dias imediatamente antes do `from`.
  - `year`: mesmo intervalo um ano antes.
  - `custom`: usuário escolhe.
- Recentes salvos por preset key (não por data absoluta).
- Calendário com `pointer-events-auto` (regra shadcn).
- Sem alterações de schema.

## Fora do escopo
- Não muda nenhum outro filtro (canal, SDR, closer).
- Não adiciona trimestre/ano-até-hoje (usuário pediu igual ao print).
- Não altera nenhuma edge function.
