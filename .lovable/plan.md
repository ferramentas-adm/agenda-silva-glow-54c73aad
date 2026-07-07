
## Escopo aprovado

Implementar apenas o **item 3** do plano anterior: deixar o rótulo do card "Total agend. dia" da barra de status do Calendário explícito sobre o escopo que está sendo contado.

Como o rótulo depende de um escopo escolhido, isso implica também introduzir o seletor mínimo (item 1) — sem ele o card teria só um rótulo estático. Vou incluir o seletor apenas como suporte ao rótulo, sem os breakdowns visuais do item 2.

## Alterações

Arquivo único: `src/pages/DashboardPage.tsx` (bloco `Status counters`, ~linha 823).

1. Novo estado local:
   ```ts
   const [statusScope, setStatusScope] = useState<"todos" | "sdr" | "segunda">("todos");
   ```
   Escondido para `role === "closer"` (mantém visão individual atual).

2. Segmented control compacto acima da grade dos cards, à direita do título/linha existente:
   ```
   [ Todos ]  [ SDR ]  [ 2ª reunião ]
   ```
   Usando `ToggleGroup` do shadcn já disponível no projeto.

3. `sourceAgendamentos` e `sourceCounts` passam a ser derivados de `statusScope`:
   - `todos` → `filtered` + `allStatusCounts` (comportamento atual)
   - `sdr` → `filtered.filter(isSdrAgenda)` + counts recalculados
   - `segunda` → `filtered.filter(isSecondMeetingAgenda)` + counts recalculados

4. Rótulo dinâmico do card `total_agend`:
   - `todos` → "Total agend. dia"
   - `sdr` → "Total agend. dia (SDR)"
   - `segunda` → "Total 2ª reunião dia"

   E `totalAgend` recalculado conforme escopo:
   - `todos` → `totalSdrCount + closerCreatedCount` (atual)
   - `sdr` → `totalSdrCount`
   - `segunda` → `closerCreatedCount`

## Fora do escopo

- Breakdown "SDR X · 2ª Y" abaixo do número (item 2 — não será feito).
- Comentários de paridade no código (item 4 — não será feito).
- Nenhuma mudança no Dashboard Comercial, em outros painéis, no banco, RLS ou queries.

Aguardo aprovação para implementar.
