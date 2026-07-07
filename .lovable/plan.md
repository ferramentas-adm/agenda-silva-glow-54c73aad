## Escopo

Remover o seletor de escopo (Todos / SDR / 2ª reunião) adicionado recentemente na barra de status do Calendário e, no lugar dele, incluir um card fixo **"Total SDR"** que exibe a quantidade de agendamentos de origem SDR (`totalSdrCount`). Os demais cards voltam a refletir todos os agendamentos do dia (comportamento anterior ao escopo).

## Alterações

Arquivo único: `src/pages/DashboardPage.tsx`.

1. **Remover estado `statusScope`** (~linha 163):
   - Excluir `const [statusScope, setStatusScope] = useState<...>("todos");`

2. **Remover o seletor de escopo** do bloco `Status counters` (~linhas 897–922):
   - Excluir os botões "Todos / SDR / 2ª reunião".

3. **Restaurar lógica dos cards ao geral**:
   - `sourceAgendamentos = filtered`
   - `sourceCounts = allStatusCounts`
   - `totalAgend = totalSdrCount + closerCreatedCount`
   - `totalAgendLabel = "Total agend. dia"`
   - Remover variáveis intermediárias `scope`, `scopedAgendamentos`, `scopedCounts`.

4. **Adicionar card "Total SDR"** ao final da grade, junto a "Total Closers" e "Closer Realizada" (visão não-closer):
   - Valor: `totalSdrCount`
   - Ícone: `Users` (ou similar já importado)
   - Cor: tom distinto dos cards existentes (ex.: `text-cyan-400` / `bg-cyan-500/10`)
   - Sem click handler (apenas exibição)

5. **Ajustar grid responsivo**:
   - Visão não-closer: `xl:grid-cols-12` (9 cards base + Total SDR + Total Closers + Closer Realizada)
   - Visão closer: manter `xl:grid-cols-9`

6. **Verificação**: rodar `tsgo` para garantir que não há erros de tipo após remover `statusScope`.

## Fora do escopo

- Nenhuma mudança em regras de cálculo de `totalSdrCount`, `closerCreatedCount` ou `allStatusCounts`.
- Nenhuma alteração no Dashboard Comercial, banco, RLS, queries ou outros painéis.
- Não adicionar drilldown ao novo card.