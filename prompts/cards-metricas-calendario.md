# Prompt: Cards de Métricas do Calendário

Gere o código React + TypeScript para os cards de métricas da barra de status do calendário, localizados em `src/pages/DashboardPage.tsx`, dentro do bloco comentado `{/* Status counters */}`.

## Contexto do projeto

- Stack: React 18, Vite 5, TypeScript 5, Tailwind CSS v3, shadcn/ui.
- Tema: light/dark com suporte a tokens CSS. Sidebar e headers mobile sempre escuros.
- Timezone: todos os horários devem ser tratados como `America/Sao_Paulo`. Use helpers de `src/lib/timezone.ts` quando necessário; nunca use `new Date().getHours/Date/Month` nem `format(new Date(iso), …)` para timestamps UTC do banco.
- Ícones: Lucide React.
- Cores: use apenas tokens Tailwind semânticos (`text-sky-300`, `bg-sky-500/10`, `text-primary`, `bg-primary/10`, `text-destructive`, etc.). Nunca hardcodeie cores hex (`#...`) nem classes como `text-white`/`bg-black`.

## Localização no código

Os cards devem ficar em `src/pages/DashboardPage.tsx`, acima do título "Calendário" e abaixo do comentário `{/* Status counters */}`.

## Dados disponíveis

Considere que as seguintes variáveis já existem no componente e devem ser reutilizadas:

- `filtered`: lista de `Agendamento[]` do dia selecionado, já filtrada pelos closers selecionados e pelo SDR selecionado (quando aplicável).
- `closerOwnAgendamentos`: agendas do closer logado (`filtered.filter(a => a.closer_id === myCloserId)`).
- `allStatusCounts`: contagem de status de TODAS as agendas do dia (`filtered`).
- `closerOwnStatusCounts`: contagem de status das agendas do closer logado.
- `userRolesMap`: `Map<string, string>` com `user_id -> role` (inclui overrides de SDR).
- `role`: papel do usuário logado ("gestor", "moderador", "supervisor", "sdr", "closer", etc.).
- `TOTAL_STATUSES = ["agendada", "confirmada", "realizada", "cancelada", "no_show", "reagendada"]`.
- `totalSdrCount`: agendas SDR com status em `TOTAL_STATUSES`.
- `closerCreatedCount`: agendas de 2ª reunião com status em `TOTAL_STATUSES`.
- `closerRealizadaCount`: agendas de 2ª reunião com status `"realizada"`.
- `setTotalChannelsData`, `setTotalChannelsTotal`, `setTotalChannelsOpen`: estado para o drilldown de canais do card "Total agend. dia".

## Helpers de classificação

Use estas regras (já implementadas no componente):

```ts
const isSdrAgenda = (a: Agendamento) => {
  if (a.created_by && userRolesMap.get(a.created_by) === "sdr") return true;
  if (a.sdr_responsavel_id) return true;
  return false;
};

const isSecondMeetingAgenda = (a: Agendamento) => {
  if (a.created_by && userRolesMap.get(a.created_by) === "closer") return true;
  if (a.meeting_reason === "segunda_reuniao") return true;
  return false;
};
```

## Regras de cálculo

1. **Visão de closer** (`role === "closer"`):
   - `sourceCounts = closerOwnStatusCounts`
   - `sourceAgendamentos = closerOwnAgendamentos`
   - grid: `xl:grid-cols-9`
   - mostra apenas os 9 cards base (sem "Total SDR", "Total Closers", "Closer Realizada")

2. **Visão não-closer** (gestor/moderador/supervisor/sdr):
   - `sourceCounts = allStatusCounts`
   - `sourceAgendamentos = filtered`
   - grid: `xl:grid-cols-12`
   - mostra os 9 cards base + 3 cards extras: "Total SDR", "Total Closers", "Closer Realizada"

3. **Cálculos dos cards base**:
   - **Total agend. dia**: não-closer = `totalSdrCount + closerCreatedCount`; closer = `sourceAgendamentos.filter(a => TOTAL_STATUSES.includes(a.status)).length`.
   - **Ainda a real. dia**: `(sourceCounts["agendada"] ?? 0) + (sourceCounts["confirmada"] ?? 0)`.
   - **Sem confirmar**: `sourceCounts["agendada"] ?? 0`.
   - **Confirmadas**: `sourceCounts["confirmada"] ?? 0`.
   - **Realizadas**: `sourceCounts["realizada"] ?? 0`.
   - **Canceladas**: `sourceCounts["cancelada"] ?? 0`.
   - **No-shows**: `sourceCounts["no_show"] ?? 0`.
   - **Reagendadas**: agendas com `status === "reagendada"` OU `original_agendamento_id` preenchido (use `Set` para não duplicar).
   - **Não comparecimento**: `cancelada + no_show + reagendada`.

4. **Cards extras (apenas visão não-closer)**:
   - **Total SDR**: `totalSdrCount`.
   - **Total Closers**: `closerCreatedCount`.
   - **Closer Realizada**: `closerRealizadaCount`.

## Comportamento de clique

Apenas o card **"Total agend. dia"** deve ser clicável. Ao clicar:

```ts
const pool = sourceAgendamentos.filter(
  (a) =>
    TOTAL_STATUSES.includes(a.status) &&
    !isSecondMeetingAgenda(a) &&
    (isCloserView || isSdrAgenda(a)),
);
const map = new Map<string, number>();
pool.forEach((a) => {
  const ch = a.channel_type || "Sem canal";
  map.set(ch, (map.get(ch) ?? 0) + 1);
});
const items = Array.from(map.entries())
  .map(([canal, qtd]) => ({ canal, qtd }))
  .sort((a, b) => b.qtd - a.qtd);
setTotalChannelsData(items);
setTotalChannelsTotal(pool.length);
setTotalChannelsOpen(true);
```

Adicione `cursor-pointer hover:border-primary/30 transition-colors` apenas nesse card.

## Especificação visual dos cards

Cada card deve ter:

- container: `rounded-xl border border-primary/10 p-2 flex flex-col items-center justify-center text-center gap-1 min-w-0`;
- background colorido sutil (ex.: `bg-sky-500/10`);
- ícone Lucide: `h-4 w-4 shrink-0` com cor correspondente;
- número: `text-lg font-bold leading-none`;
- rótulo: `text-[10px] text-muted-foreground leading-tight`.

### Cards e estilos

| Rótulo | Ícone | Cor do ícone | Background |
|--------|-------|--------------|------------|
| Total agend. dia | `CalendarDays` | `text-sky-300` | `bg-sky-500/10` |
| Ainda a real. dia | `Hourglass` | `text-amber-300` | `bg-amber-500/10` |
| Sem confirmar | `Clock` | `text-blue-300` | `bg-blue-500/10` |
| Confirmadas | `CheckCircle2` | `text-primary` | `bg-primary/10` |
| Realizadas | `CheckCircle2` | `text-emerald-400` | `bg-emerald-500/10` |
| Canceladas | `XCircle` | `text-destructive` | `bg-destructive/10` |
| No-shows | `AlertCircle` | `text-orange-400` | `bg-orange-500/10` |
| Reagendadas | `RotateCcw` | `text-blue-400` | `bg-blue-500/10` |
| Não comparecimento | `Ban` | `text-rose-400` | `bg-rose-500/10` |
| Total SDR | `Users` | `text-cyan-400` | `bg-cyan-500/10` |
| Total Closers | `Users` | `text-purple-400` | `bg-purple-500/10` |
| Closer Realizada | `CheckCircle2` | `text-emerald-400` | `bg-emerald-500/10` |

## Layout responsivo

```tsx
<div className={cn(
  "grid grid-cols-2 sm:grid-cols-4 gap-3",
  isCloserView ? "xl:grid-cols-9" : "xl:grid-cols-12"
)}>
  {/* cards base */}
  {!isCloserView && (
    <>
      {/* Total SDR */}
      {/* Total Closers */}
      {/* Closer Realizada */}
    </>
  )}
</div>
```

## Constraints obrigatórias

- Não altere regras de cálculo fora do escopo deste prompt.
- Não adicione backend, banco, RLS, edge functions ou novas queries.
- Não remova funcionalidades existentes (drilldown de canais, filtros de closer/SDR, realtime).
- Mantenha o TypeScript tipado; use `Agendamento` e os tipos já existentes.
- Não hardcodeie cores hex ou classes fixas de cor que quebrem o tema dark/light.
- Preserve a visão de closer (9 cards) e a visão geral (12 cards).

## Resultado esperado

O código gerado deve ser um bloco JSX/TSX substituível diretamente no `{/* Status counters */}` de `src/pages/DashboardPage.tsx`, compilando sem erros de tipo e mantendo o mesmo comportamento e aparência dos cards atuais.
