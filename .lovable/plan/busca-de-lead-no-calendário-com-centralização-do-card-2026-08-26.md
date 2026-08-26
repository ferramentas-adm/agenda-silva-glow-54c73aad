# Busca de lead no Calendário com centralização do card

Adicionar um campo "Buscar lead no calendário..." na barra de filtros da página Calendário. Ao digitar, aparece uma lista de sugestões com os leads do dia exibido; ao escolher um, o calendário rola horizontalmente até a coluna do closer e verticalmente até o horário, deixando o card centralizado na tela e destacado por alguns segundos.

## Comportamento

- Campo de busca fica junto aos filtros (acima da grade), com ícone de lupa e botão de limpar.
- Busca por nome do lead e também por telefone, sem diferenciar acentos/maiúsculas.
- Escopo: apenas os agendamentos do dia atualmente exibido (respeitando os filtros ativos de closer/SDR).
- Sugestões: até 8 resultados, cada um mostrando nome do lead, horário, closer e status. Navegação por setas e Enter; Esc fecha.
- Ao selecionar:
  - Se o closer do agendamento estiver oculto no filtro, ele é reativado automaticamente para o card poder aparecer.
  - A grade rola na horizontal até centralizar a coluna do closer e a página rola na vertical até centralizar a linha do horário.
  - O card recebe destaque temporário (anel/ring de destaque + leve pulso) por ~4 segundos, ou até o usuário clicar em outro lugar.
- Se o lead não existir no dia exibido, a lista mostra "Nenhum lead encontrado neste dia".

## Detalhes técnicos

- `src/pages/DashboardPage.tsx`:
  - Novo estado `leadSearch` (texto) e `highlightAgId` no componente da página.
  - Sugestões calculadas com `useMemo` sobre a lista `filtered` do dia, com normalização de acentos.
  - Ao selecionar: garantir `selectedIds` contendo o `closer_id` (via `toggle` do `useCloserFilter`), setar `highlightAgId` e limpar o termo.
  - Passar `highlightAgId` como prop nova para `DayView`.
- `DayView`:
  - `useEffect` reagindo a `highlightAgId`: localiza o card via `data-ag-id` dentro do container `scrollRef`, calcula `scrollLeft` para centralizar a coluna no container e usa `scrollIntoView({ block: "center" })` para o eixo vertical, ambos com `behavior: "smooth"`.
  - Cada card do agendamento recebe `data-ag-id={ag.id}` e, quando destacado, classes de ring/animação usando tokens do design system (sem cores hardcoded).
- Timer de limpeza do destaque com `setTimeout` e cleanup no unmount para evitar leaks.
- Nenhuma alteração de banco, RLS ou Edge Function.
