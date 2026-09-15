# Filtro Turma A / Turma B no Calendário

## O que muda para quem usa

Na tela **Calendário**, logo acima dos botões de closers, aparece um seletor com três opções:

- **Todos** — comportamento atual, mostra a agenda de todos os closers.
- **Turma A** — mostra somente os closers normais (que atendem leads qualificados).
- **Turma B** — mostra somente os closers em treinamento (que atendem apenas leads desqualificados).

Regras de comportamento:
- Ao escolher Turma A ou Turma B, a lista de botões de closers abaixo passa a mostrar apenas os closers daquela turma, e o calendário exibe somente as agendas deles.
- Ao voltar para **Todos**, a lista completa volta.
- Cada turma mostra a contagem de closers ao lado do nome (ex.: "Turma B (3)").
- A escolha fica salva no navegador, então ao voltar à tela o filtro continua como estava.
- Quem tem função **Closer** continua vendo apenas a própria agenda; o seletor não aparece para ele.
- Nada muda nos cards de métricas do topo, nas contagens, na tela de Agendar, nem nas permissões.

## Detalhes técnicos

- `src/hooks/useCloserFilter.ts`: o `select` de closers passa a trazer `em_treinamento`; a interface `Closer` ganha o campo. Novo estado `turma: "todos" | "a" | "b"` persistido em `localStorage` (chave `closer-turma-<userId>`), exposto no retorno junto com `setTurma`. `visibleClosers` filtra por `em_treinamento === (turma === "b")` quando `turma !== "todos"`; a lógica de closer-role permanece intocada. Contagens `countTurmaA` / `countTurmaB` derivadas da lista completa.
- A seleção de ids (`selectedIds`) não é alterada pelo filtro de turma — a filtragem do calendário passa a considerar a interseção entre `selectedIds` e os ids visíveis, exposta como `effectiveSelectedIds` pelo hook, para não perder a seleção do usuário ao alternar turmas.
- `src/pages/DashboardPage.tsx`: usa `effectiveSelectedIds` no lugar de `selectedIds` nos filtros de agendamentos, `closerIds` (Google busy blocks e `closer_blocks`) e na coloração/colunas. Renderiza o novo seletor acima de `CloserFilterBar`, oculto quando `isCloserRole`.
- Novo componente `src/components/calendar/TurmaFilter.tsx` no padrão de `src/components/sdr/SdrTeamFilter.tsx` (botões `Button` size sm, variantes ativa/inativa via tokens do design system).
- Sem migração, sem mudança de RLS, queries de escrita ou backend — filtro puramente de apresentação sobre o campo `closers.em_treinamento` já existente.
