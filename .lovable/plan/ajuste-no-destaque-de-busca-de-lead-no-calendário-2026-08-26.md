# Ajuste no destaque de busca de lead no calendário

## Objetivo
Alterar o efeito visual de destaque do card de reunião quando localizado pela busca de lead no calendário: remover o preenchimento interno verde-limão e manter apenas uma borda grossa pulsante, limitada ao período de destaque.

## Alteração proposta
No arquivo `src/pages/DashboardPage.tsx`, no trecho que aplica classes condicionais quando `highlightAgId === ag.id` (linha ~2506), substituir o efeito atual de `ring` + sombra interna preenchida por uma borda mais espessa e visível, mantendo a animação de pulso.

### Comportamento esperado
- O card não fica com fundo/área interna preenchida de verde-limão.
- Apenas a borda do card é destacada durante o período de destaque.
- A espessura da borda é aumentada nesse estado.
- A animação de pulso (`animate-search-highlight`) pode ser mantida para chamar atenção.
- O destaque continua sendo removido ao clicar no card ou após o timeout de 20 segundos.

## Escopo
- Apenas ajuste visual no componente `DashboardPage.tsx`.
- Nenhuma alteração de lógica de busca, scroll, timer ou estado.

## Validação
- Verificar visualmente no preview se o card destacado exibe apenas borda grossa, sem preenchimento interno.
- Garantir que o build/typecheck continue passando.
