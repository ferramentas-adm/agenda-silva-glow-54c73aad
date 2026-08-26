# Destaque de busca de lead mais visível no calendário

Aumentar a intensidade do efeito visual que destaca o card do lead encontrado na busca do calendário, pois o anel atual está muito tímido.

## Alterações

- Em `src/pages/DashboardPage.tsx`, no `DayView`, reforçar as classes do card destacado (`highlightAgId === ag.id`):
  - Aumentar o anel de `ring-2` para `ring-4`.
  - Adicionar glow forte ao redor do card usando sombra com a cor primária (`shadow-[0_0_24px_hsl(var(--primary)/0.6)]` ou utilitário equivalente via token).
  - Substituir o `animate-pulse` padrão por uma animação customizada mais pronunciada (ex.: pulso de opacidade/escala 1 → 1.03 → 1 e brilho do ring).
  - Manter `z-20` e `ring-offset-card` para não perder o contraste sobre o fundo da grade.
  - Manter a duração do destaque em ~5 segundos, controlada pelo timer existente.

- Adicionar o keyframe da animação no `tailwind.config.ts` (ou em `src/index.css`) com nome semântico, por exemplo `search-highlight-pulse`, para ser usado como `animate-search-highlight`.

## Escopo

- Apenas ajuste visual do destaque da busca de lead.
- Nenhuma mudança de comportamento, estado, banco ou lógica de scroll.
