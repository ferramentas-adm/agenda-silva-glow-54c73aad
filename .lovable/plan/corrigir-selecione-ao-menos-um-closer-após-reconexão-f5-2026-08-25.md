# Corrigir "Selecione ao menos um closer" após reconexão / F5

## O que está acontecendo

A mensagem aparece quando a lista de closers selecionados no Calendário fica vazia. Isso é uma corrida de carregamento no hook que controla o filtro de closers (`src/hooks/useCloserFilter.ts`):

- A inicialização da seleção roda assim que usuário e função (role) estão disponíveis, **sem esperar** a lista de closers terminar de carregar.
- Se a lista ainda está vazia nesse instante:
  - a seleção é gravada como vazia e o hook se marca como "inicializado" (não tenta de novo);
  - para a função **Closer**, o efeito de sincronização que preencheria a seleção depois é ignorado de propósito (`if (role === "closer") return`), então a seleção fica vazia até um novo reload.
- Resultado: em conexões/renders mais lentos (justamente após o fluxo de reconexão do Google, que dispara refetches), o Closer cai na tela "Selecione ao menos um closer..." e precisa recarregar 1–3 vezes até a corrida acontecer na ordem favorável.

## Correção

Em `src/hooks/useCloserFilter.ts`:

1. Não inicializar enquanto a query de closers não terminar (`isLoading`) — a inicialização passa a esperar dados reais.
2. Se, após carregar, a lista estiver vazia, não marcar como inicializado; tentar novamente quando a lista chegar.
3. Para a função Closer: se o registro de closer correspondente ao e-mail ainda não estiver na lista, não fixar seleção vazia — reavaliar quando a lista atualizar; e adicionar um efeito de reconciliação que reponha a seleção do próprio closer caso ela fique vazia.
4. Manter `isLoading` do hook como `isLoading || !initialized`, garantindo que o Calendário mostre o skeleton em vez da mensagem de estado vazio durante o carregamento.

Em `src/pages/DashboardPage.tsx` (apenas apresentação): quando o hook já terminou mas a seleção está vazia por 1 render, continuar exibindo skeleton em vez da mensagem, e ajustar o texto da mensagem para o caso real de "nenhum closer selecionado" (usuário desmarcou todos).

Sem mudanças em banco, RLS ou queries — o bug é de estado no cliente.
