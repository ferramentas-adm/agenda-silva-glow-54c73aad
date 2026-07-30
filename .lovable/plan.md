## Objetivo

Na seção "Usuários" da página Administração, adicionar dois novos controles ao lado do filtro "Todas as funções":

1. **Ordem alfabética** — A→Z (crescente) / Z→A (decrescente), por nome.
2. **Status** — Todos / Apenas ativos / Apenas inativos.

## Comportamento

- Os filtros combinam com os já existentes (função + busca por nome/e-mail).
- O contador do título passa a refletir o resultado filtrado, ex.: `Usuários (23 de 85)` quando algum filtro estiver aplicado; mostra só `Usuários (85)` quando nada estiver filtrado.
- Padrões iniciais: ordem A→Z, status "Todos" (mantém a visão atual).
- Ordenação usa comparação com acentuação pt-BR (`localeCompare`) para nomes como "Álvaro" ficarem no lugar certo.

## Detalhes técnicos

Arquivo único: `src/pages/AdminPage.tsx`

- Dois novos estados: `sortDir` (`"asc" | "desc"`) e `filterStatus` (`"all" | "active" | "inactive"`).
- Dois `Select` compactos (mesmo estilo do filtro de função: `h-8 text-xs`) no cabeçalho da lista; em telas estreitas o grupo quebra em linha (`flex-wrap`).
- A cadeia atual `allUsers.filter(...).map(...)` passa a ser um `useMemo` que aplica: filtro de função → filtro de status (`u.active`) → busca → ordenação por `name`.
- Sem mudanças de backend; `active` já vem do carregamento atual (profiles e closers legados).
