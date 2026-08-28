# Auditoria ponta a ponta da página Vendas (filtros de data e intervalo)

Verifiquei o código da aba e cruzei com o banco. Hoje (28/08) existem **11 vendas registradas, R$ 46.500 coletado** — exatamente o que o painel "Vendas registradas" mostra. Os cartões de cima mostrando **Coletado R$ 0, Vendas Fechadas 0, Vendas em 1ª Call "—" e Follow-ups Ativos 0** estão errados: no banco há **717 follow-ups ativos (661 atrasados, 2 hoje)**. Abaixo, as causas confirmadas e as correções.

## 1. Cartões zerados enquanto a página ainda carrega (causa principal do print)

Os cartões Coletado, Coletado Médio, Vendas Fechadas, Vendas em 1ª Call, Follow-ups Ativos, Motivos de Não Fechamento e o numerador da Performance por Closer vêm todos de **uma única consulta gigante** que baixa as vendas de uma janela de 180 dias para trás e 60 para frente e processa no navegador. Essa janela tem hoje **7.796 linhas**, baixadas em 8 requisições sequenciais de 1.000 — leva vários segundos, e nesse meio-tempo a tela mostra **zero** como se fosse resultado real (enquanto o cartão de conversão, que é agregado no banco, já apareceu preenchido com 9 de 146).

Correção:
- Trocar a consulta ampla por consultas **restritas ao período selecionado** (agregação no banco), eliminando o download de milhares de linhas.
- Enquanto qualquer consulta do bloco estiver carregando, mostrar **esqueleto de carregamento** nos cartões, nunca "0"/"R$ 0".

## 2. Vendas de follow-up antigas podem desaparecer dos cartões em modo intervalo

Em modo intervalo a janela de busca só volta **60 dias** antes do início do intervalo. Uma venda fechada dentro do intervalo, cuja reunião original é mais antiga que isso, entra no painel "Vendas registradas" (que não tem essa limitação) mas **não** entra em Coletado / Vendas Fechadas / Performance por Closer. Hoje não há caso assim no banco, mas é uma bomba armada e explica divergências futuras em intervalos longos.

Correção: buscar as vendas do período pela **data de fechamento** (mesma regra do painel), sem depender da data da reunião.

## 3. Cartões e painel contam coisas diferentes com nomes parecidos

- Painel "Vendas registradas": conta toda venda com `vendeu`, independente do status da reunião, incluindo vendas avulsas.
- Cartões de cima: exigem reunião com status **realizada**. Existem hoje **8 vendas cujo agendamento não está "realizada"** (1 nos últimos 30 dias), então os dois blocos podem legitimamente divergir sem nenhum aviso na tela.

Correção: unificar a base (venda registrada no período = mesma lista nos dois blocos) e deixar o critério explícito no subtítulo. Quando houver venda cuja reunião ainda não está marcada como realizada, mostrar aviso discreto (igual ao já feito no card Conversão por hora), em vez de simplesmente sumir com o número.

## 4. "Follow-ups Ativos" muda conforme o filtro de data (mas é métrica global)

O cartão é descrito como escopo geral, porém é calculado sobre a mesma janela de vendas — então **o valor muda quando o gestor troca a data/intervalo** e zera enquanto carrega. Correção: consulta própria, contada no banco (ativos / hoje / atrasados), independente do filtro de período, com "hoje" calculado em horário de Brasília.

## 5. "Hoje" calculado no fuso do navegador

`todayStr` (usado para follow-ups de hoje/atrasados) usa a data local da máquina, não America/Sao_Paulo. Para quem acessa fora do fuso, ou perto da meia-noite, a contagem vira errada. Correção: usar o helper de data BRT do projeto.

## 6. Selecionar um único dia no calendário de intervalo é ignorado

Quando o gestor escolhe apenas a data inicial (sem a final), a aba Vendas cai no dia de `currentDate` (normalmente hoje), enquanto as outras abas do dashboard tratam esse caso como "de X até X". Resultado: o título mostra um dia e os números são de outro. Correção: alinhar a aba Vendas ao comportamento das demais (`to = from` quando só há data inicial).

## 7. Bases mistas nos subtítulos

- "Vendas Fechadas" conta pela data de fechamento, mas o subtítulo "N não fechou" conta pela data da reunião — duas réguas no mesmo cartão.
- A métrica oculta de oferta de preço divide numerador de uma base por denominador de outra.

Correção: alinhar o "não fechou" à data da reunião **explicitada no rótulo** ("N não fechou em reuniões do período") e corrigir a base da métrica de oferta de preço.

## Detalhes técnicos

- `src/components/dashboard/VendasTab.tsx`:
  - Substituir a query `vendas-tab` (janela 180/60 + paginação de 8 páginas) por: (a) query de **vendas do período** filtrada por data efetiva de fechamento (`closed_at`, com fallback `updated_at` em BRT) — a mesma base do painel; (b) query de **não fechou** por `agendamentos.scheduled_date` no período; (c) query dedicada de **follow-ups ativos** sem janela de período. Manter `refetchInterval` 5 min / `staleTime` 60s.
  - Aplicar `sel = (s: string) => s` + `.returns<T>()` nas queries com embed para não degradar o typecheck.
  - Expor `isLoading` das queries e renderizar esqueleto nos `KpiCard`s e nos quadros dependentes.
  - `todayStr` → `brTodayYMD()` (já importado).
  - `isRange`/`rangeFromStr`/`rangeToStr`: aceitar `from` sem `to` usando `to = from`.
  - `closingDateOf` passa a ser a única regra de atribuição de data de venda (usada por KPIs, Performance por Closer e painel).
  - Corrigir denominador de `pctOfertaPreco` e o rótulo do subtítulo de "Vendas Fechadas".
- `src/components/dashboard/ConversaoPorHoraCard.tsx`: apenas confirmar que recebe o mesmo `convPeriodFrom/To` após o ajuste do item 6 (sem mudança de lógica).
- Sem alterações de banco. A RPC `dashboard_conversao_period` continua sendo a fonte do cartão Taxa de Conversão.

## Validação após implementar

- Hoje (28/08): Coletado Total = R$ 46.500, Vendas Fechadas = 11, Follow-ups Ativos = 717 (2 hoje · 661 atrasados) — batendo com o painel "Vendas registradas" e com o banco.
- Intervalo 01/08–28/08 e 01/07–28/08: soma dos dias individuais = total do intervalo; Performance por Closer soma igual ao total de vendas.
- Selecionar só a data inicial no calendário: título e números do mesmo dia.
- Trocar de data rapidamente: cartões mostram esqueleto, nunca zero temporário.
