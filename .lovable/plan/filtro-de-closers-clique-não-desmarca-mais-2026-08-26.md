# Filtro de closers: clique não desmarca mais

## O que a verificação mostrou

O clique funciona, mas a seleção é desfeita no mesmo instante.

Em `src/hooks/useCloserFilter.ts` existe um efeito de reconciliação criado para incluir closers novos na seleção salva. Ele percorre todos os closers ativos e **adiciona de volta qualquer um que não esteja selecionado** — e roda também quando `selectedIds` muda. Ou seja: você clica para tirar um closer da visualização, o estado muda, o efeito dispara e recoloca o closer imediatamente. Visualmente nada acontece.

## Como vai ficar

- Clicar no nome do closer volta a tirá-lo (e a devolvê-lo) da visualização do dia, como antes.
- A seleção continua salva por usuário entre sessões.
- Closers recém-cadastrados continuam entrando automaticamente na visualização — mas isso passa a acontecer só quando a lista de closers realmente muda, não a cada clique.
- Closers inativos/removidos continuam saindo da seleção.
- Continua garantido ao menos um closer selecionado, e a regra da função Closer (vê só a própria agenda) não muda.

## Detalhes técnicos

- `src/hooks/useCloserFilter.ts`: reescrever o efeito de reconciliação para reagir apenas à mudança da lista de closers ativos.
  - Guardar em `useRef` a assinatura da última lista de ids ativos reconciliada; sair cedo se a assinatura não mudou.
  - Remover `selectedIds` das dependências do efeito (usar apenas o updater funcional de `setSelectedIds`), mantendo a repescagem do próprio closer quando a seleção fica vazia na função Closer.
  - Manter a limpeza de ids inativos e o fallback "seleção vazia → todos os ativos".
