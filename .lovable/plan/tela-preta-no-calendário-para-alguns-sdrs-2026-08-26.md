# Tela preta no Calendário para alguns SDRs

## Diagnóstico

A causa está na trava de reuniões vencidas (`OverdueMeetingsLockOverlay`), que é renderizada dentro do layout de todas as páginas.

O componente faz dois `return null` antecipados (quando não há reunião vencida e quando a rota está na lista de exceções) e, **depois desses returns**, chama mais um hook (`useQuery` da lista de closers para "Definir closer que atendeu"). Isso quebra a regra de ordem de hooks do React: no momento em que a contagem de reuniões vencidas muda de 0 para 1 ou mais (ou volta para 0), o React executa um número diferente de hooks e lança o erro "Rendered more hooks than during the previous render".

Como o projeto **não tem nenhum Error Boundary**, esse erro derruba a árvore inteira: a página termina de carregar, o React desmonta tudo e sobra apenas o fundo escuro — exatamente a "tela preta" relatada.

Isso explica por que só acontece com alguns SDRs: a trava só é habilitada para SDR/Closer (gestores/moderadores/supervisores estão excluídos) e só dispara quando o usuário tem reunião vencida sem atualização, que é justamente quando a contagem muda de 0 para 1 depois do primeiro carregamento dos dados.

## O que será feito

1. **Corrigir a ordem dos hooks na trava de tela**: mover a consulta de closers para antes dos returns antecipados, de modo que todos os hooks sejam sempre executados na mesma ordem em qualquer render. Nenhum comportamento visível muda — a consulta continua só sendo disparada quando o painel de "Definir closer que atendeu" é aberto.

2. **Adicionar uma barreira de erro global** (Error Boundary) em volta das rotas: se qualquer erro inesperado voltar a acontecer, o usuário verá uma tela com a mensagem do erro e um botão "Recarregar" em vez de uma tela preta sem explicação. O erro também é registrado no console para diagnóstico.

3. **Varredura de segurança nos demais componentes**: conferir se existe outro componente com hook depois de `return` antecipado (padrão que causa o mesmo travamento) e corrigir se houver.

## Detalhes técnicos

- `src/components/OverdueMeetingsLockOverlay.tsx`: mover o `useQuery(["transferable-closers-trava"])` para o topo, junto dos outros hooks, mantendo `enabled: transferFor !== null`. Os `if (count === 0) return null` e o filtro de rotas passam a vir depois de todos os hooks.
- Novo `src/components/ErrorBoundary.tsx` (class component com `componentDidCatch` + `getDerivedStateFromError`), envolvendo `<Routes>` em `src/App.tsx` dentro do `Suspense`. UI de fallback usando tokens do design system (sem cores hardcoded).
- Revisão rápida dos componentes com `return null`/`return <...>` no meio do corpo para garantir que nenhum hook venha depois.
- Nenhuma mudança de banco, RLS ou Edge Function.
