# Vendas: corrigir métricas truncadas e lentidão em períodos longos

Fiz a varredura. O status "realizada" **não** está errado no banco — o problema é que a página só recebe as **1.000 primeiras linhas** de cada consulta (limite do backend). Em "Este mês" isso quebra praticamente todos os quadros.

## O que está errado (confirmado no banco, 01/08–31/08)

| Métrica | Banco | Tela |
| --- | --- | --- |
| Reuniões realizadas em agosto | 3.461 | truncado em 1.000 |
| Reuniões realizadas do Geraldo | 196 | 52 |
| Calls "não fechou" | 3.017 | 1.023 |
| Vendas fechadas | 395 | 395 (ok) |

Causas:

1. **Sem paginação.** As consultas de reuniões realizadas, de "não fechou" e de vendas baixam linhas cruas e param em 1.000. Como a ordem das linhas é arbitrária, cada closer recebe um pedaço aleatório das suas reuniões — por isso o Geraldo aparece com 52 reuniões e 77% de conversão em vez de 196 reuniões e ~20%.
2. **Lentidão.** Mesmo truncado, o navegador baixa milhares de linhas completas (inclui briefing, resumo, observações) e recalcula tudo em memória — daí a demora e os cartões piscando.
3. **Closer inativo aparece como "—".** A lista de closers busca só `active = true`, mas existem 41 closers inativos com vendas/reuniões no histórico; os nomes deles somem do quadro.
4. **406 reuniões realizadas sem closer atribuído** em agosto ficam fora do quadro (correto), mas hoje não há nenhuma indicação disso na tela.

## Correções

- Contagens passam a ser **feitas no banco** (agregação), não no navegador: números exatos independentemente do tamanho do período, e carregamento rápido.
  - Performance por Closer: realizadas, vendas e receita por closer, já com o filtro Geral / Social Selling / Tráfego aplicado no banco.
  - KPIs (Coletado, Coletado Médio, Vendas Fechadas, Vendas em 1ª Call, "não fechou") vindos de agregação do período.
  - Motivos de Não Fechamento agregados por motivo, respeitando os filtros do quadro.
- A lista "Vendas registradas" (que precisa das linhas individuais) passa a **paginar de verdade**, sem perder vendas.
- Nomes de closers resolvidos com **todos** os closers (ativos e inativos), sem "—".
- Aviso discreto no quadro quando houver reuniões realizadas **sem closer atribuído** no período (com a quantidade), para o gestor cobrar a atribuição.
- Esqueletos de carregamento mantidos, para nunca exibir "0" durante a busca.

## Detalhes técnicos

- Novas funções de banco (SECURITY INVOKER, mantendo o RLS do usuário):
  - `dashboard_vendas_closer_perf(p_from, p_to, p_channel, p_closer_id)` → `closer_id, realizadas, vendas, receita`; realizadas por `agendamentos.status = 'realizada'` + `deleted_at is null` + `scheduled_date` no período; vendas/receita por data efetiva de fechamento (`closed_at`, fallback `updated_at` em BRT).
  - `dashboard_vendas_kpis(p_from, p_to, p_closer_id)` → coletado/faturado (calls e avulsas separados), vendas fechadas, 1ª call vs follow-up, "não fechou" por `scheduled_date`, e contagem de vendas cuja reunião não está `realizada`.
  - `dashboard_vendas_motivos(p_from, p_to, p_closer_id, p_channel, p_preco)` → `motivo, count`.
  - `dashboard_vendas_realizadas_sem_closer(p_from, p_to)` → contagem para o aviso.
  - `GRANT EXECUTE ... TO authenticated` em todas.
- `src/components/dashboard/VendasTab.tsx`:
  - Trocar as queries `vendas-tab-realizadas-closer`, `vendas-tab-nao-fechou` e o cálculo client-side de `kpis`/`motivosCount`/`closerPerf` pelas RPCs acima.
  - Manter `vendas-tab-fechadas` para a lista de vendas registradas, com paginação por `range()` em blocos de 1.000 até esgotar, e select enxuto (sem briefing/observações no caminho dos KPIs; CSV continua usando os campos completos).
  - `vendas-tab-closers`: remover `.eq("active", true)` (usar todos os closers apenas para resolver nome; filtros de seleção continuam listando ativos).
  - `refetchInterval` 5 min / `staleTime` 60s preservados; `sel()` + `.returns<T>()` mantidos.
- `ConversaoPorHoraCard` e a RPC `dashboard_conversao_period` não mudam.

## Validação

- 01/08–31/08: soma de reuniões realizadas no quadro = 3.461 − 406 sem closer = 3.055; Geraldo = 196 reuniões / 40 vendas (~20%); "não fechou" = 3.017; Vendas Fechadas = 395.
- Trocar entre "Hoje", "Este mês" e intervalos longos: cartões carregam rápido e sem zeros temporários.
- Nenhum "—" na Performance por Closer.
