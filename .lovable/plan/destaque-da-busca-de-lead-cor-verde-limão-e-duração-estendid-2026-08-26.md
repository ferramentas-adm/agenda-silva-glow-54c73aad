# Destaque da busca de lead: cor verde-limão e duração estendida

Ajustar o destaque do card encontrado na busca do calendário para usar a mesma cor verde-limão do botão "Agendar" do print e permanecer visível até o operador clicar no card ou até 20 segundos.

## Alterações

- Em `src/pages/DashboardPage.tsx`:
  - Manter o efeito de pulso (`animate-search-highlight`) e o glow existente.
  - Garantir que a cor do anel e do glow usem o token primário verde-limão do design system (`ring-primary` e `shadow-[...hsl(var(--primary))...]`), que equivale à cor do botão do print.
  - Aumentar o timer de limpeza automática de 5s para 20s (`window.setTimeout(..., 20000)`).
  - Limpar o destaque imediatamente quando o card destacado receber um clique (`onClick` do card chama `setHighlightAgId(null)` se `highlightAgId === ag.id`).

## Escopo

- Apenas ajuste visual e temporal do destaque da busca de lead.
- Nenhuma mudança de banco, estado global ou lógica de scroll.
