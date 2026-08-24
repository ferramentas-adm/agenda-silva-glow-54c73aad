# Comparação por dia da semana no card "Produtividade por hora"

Adicionar, no card de produtividade por hora dos SDRs, a opção de comparar a coluna de comparação com o **mesmo dia da semana** anterior, em vez do período anterior equivalente.

## Como vai funcionar

Um seletor de modo de comparação no cabeçalho do card, com 5 opções:

- **Período anterior** (comportamento atual, padrão)
- **Última semana** — mesma dia da semana anterior (ex.: hoje seg 24/08 → seg 17/08)
- **Média 2 últimas** — média das 2 últimas segundas (17/08 e 10/08)
- **Média 3 últimas** — média das 3 últimas segundas
- **Média 4 últimas** — média das 4 últimas segundas

Regras:

- Só fica disponível quando o filtro da página está em **um único dia**. Se o filtro for um intervalo, o seletor fica desabilitado e a comparação segue "período anterior" (avisando no texto do card).
- Nas opções de média, o valor de cada hora é a média aritmética das N ocorrências daquele dia da semana (com uma casa decimal), e o Δ compara o dia selecionado com essa média.
- Cabeçalho da tabela, legenda do gráfico, textos de "Melhor/Pior hora" e o badge de % passam a refletir o modo escolhido (ex.: "Média 3 últimas segundas (17/08, 10/08, 03/08)").
- O toggle "Hora a hora / Acumulado" continua funcionando em qualquer modo.

## Detalhes técnicos

- Arquivo: `src/components/dashboard/ProdutividadePorHoraCard.tsx` (apresentação apenas; nenhuma query nova).
- Novo estado `cmpMode: "prev" | "w1" | "w2" | "w3" | "w4"`.
- Substituir o `useMemo` de `baseDays/cmpDays` por um que devolva `cmpDayList: string[]` (dias comparados) + `cmpDivisor` (1 para período anterior e "última semana", N para as médias) + `cmpLabel`. Para os modos de semana: `subDays(to, 7 * k)` para k = 1..N.
- No agregador, dividir a contagem de comparação por `cmpDivisor` e manter `Number(x.toFixed(1))`.
- Cobertura de dados: o pool `createdAgs` em `DashboardComercialPage.tsx` já busca ~2 meses de `created_at`, suficiente para 4 semanas atrás; nenhum ajuste de fetch necessário.
- UI do seletor: botões compactos (`Button size="sm"`, mesmo padrão do toggle atual) ou `Select` do shadcn, usando apenas tokens semânticos de cor.
