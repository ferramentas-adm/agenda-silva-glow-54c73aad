# Filtro Turma A / Turma B na lista de usuários (Admin)

## O que muda

Na tela **Admin → Usuários**, quando o filtro de função estiver em **Closer**, aparece um novo seletor ao lado dos filtros existentes:

- **Todas as turmas** (padrão) — comportamento atual, todos os closers.
- **Turma A** — só closers normais.
- **Turma B** — só closers em treinamento.

Comportamento:

- O seletor só aparece quando a função filtrada é "Closer"; ao trocar para outra função (SDR, Gestor etc.), ele some e a turma volta para "Todas as turmas".
- Combina com os filtros já existentes (status, ordenação, busca por nome/e-mail).
- A contagem do título ("Usuários (X de Y)") acompanha o filtro de turma, como já faz com os demais filtros.

## O que NÃO muda

- Nada muda no cadastro, na troca de turma (botões Turma A/B de cada usuário continuam iguais), nem em permissões.
- Apenas filtro visual de apresentação, sem alteração de banco ou backend.

## Detalhes técnicos

- Arquivo: `src/pages/AdminPage.tsx` (somente frontend, sem migração).
- Novo estado `filterTurma: "all" | "a" | "b"` na `UsersSection`.
- Os usuários da lista já carregam `emTreinamento` (vem de `closers.em_treinamento`) — nenhuma query nova.
- Em `visibleUsers`, quando `filterRole === "closer"` e `filterTurma !== "all"`: filtra por `emTreinamento === (filterTurma === "b")`.
- Ao mudar `filterRole` para algo diferente de "closer", `filterTurma` é resetado para "all".
- `isFiltered` passa a considerar também `filterTurma !== "all"`.
- Seletor no mesmo padrão visual dos filtros existentes (`Select` h-8 text-xs).
