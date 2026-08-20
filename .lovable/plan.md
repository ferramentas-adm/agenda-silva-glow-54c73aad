# Diagnóstico de Performance — Relatório (nada foi alterado)

## Causa raiz provável

O app não está lento por queries pesadas, e sim por **volume absurdo de requisições repetidas**. Medindo no banco (estatísticas acumuladas):

| Query | Chamadas | Média | Tempo total |
|---|---|---|---|
| Agenda do dia (Calendário) | 1.339.053 | 16 ms | 5,9 h |
| Reuniões atrasadas (banner/lock) | 737.550 | 23 ms | 4,7 h |
| Reuniões atrasadas (variante SDR) | 597.904 | 16 ms | 2,7 h |
| Lista de Reuniões (180 dias) | 226.374 | 29 ms | 1,6 h |
| Notificações | 149.152 | 37 ms | 1,6 h |
| Token Google do closer | 484.633 | 2 ms | 0,3 h |
| INSERT em audit_logs | 495.136 | 2 ms | 0,3 h |

Para uma equipe pequena, isso é ordem(s) de magnitude acima do esperado. Dois amplificadores se somam:

1. **Realtime sem filtro + invalidação global**: o canal de `agendamentos` escuta `event: "*"` para a tabela inteira. Qualquer alteração feita por qualquer pessoa dispara `invalidateQueries(["agendamentos"])` em **todos** os clientes conectados. Com dezenas de mudanças por minuto (status, reagendamento, atribuição, webhooks do CRM que também escrevem), cada evento refaz a query em cada aba aberta — inclusive abas de TV/dashboard deixadas abertas o dia inteiro.
2. **Polling paralelo agressivo**: ~20 `refetchInterval` ativos simultaneamente (30 s, 60 s, 2 min, 5 min) em telas que já recebem realtime, mais dois `setInterval` no Dashboard Comercial (1 s e 30 s).

Ou seja: lentidão **intermitente** (piora nos horários de maior operação e em abas abertas há muito tempo), afeta **todos os perfis**, mas é pior para gestor/moderador (Dashboard Comercial + telas de TV) e para closers/SDRs com muitas reuniões atrasadas (banner de lock consulta a cada 60 s + a cada UPDATE da tabela).

O banco em si está saudável: índices existem e são usados (`idx_agendamentos_scheduled_date_active`, `idx_agendamentos_closer_date`, `idx_notifications_user_unread`), RLS já está otimizada com `(select auth.uid())` e funções `SECURITY DEFINER` — não há join implícito caro por política. `audit_logs` já tem 527 mil linhas / 211 MB e `notifications` 325 mil linhas / 113 MB, sem rotina de expurgo.

---

## Problemas por severidade

### Críticos

1. **Realtime global em `agendamentos` invalidando tudo**
   Onde: `src/pages/DashboardPage.tsx:381-390`, `src/hooks/useOverdueMeetings.ts:157-172`
   Escuta a tabela inteira sem filtro e invalida a chave raiz `["agendamentos"]`, refazendo todas as queries derivadas em todos os clientes.
   Correção: filtrar o canal (por `scheduled_date` do dia visível / `closer_id` do usuário), agrupar eventos com debounce de 1-2 s, e invalidar chaves específicas (`["agendamentos", dateStr]`) em vez da raiz. Um único canal compartilhado em vez de dois.

2. **Banner/lock de reuniões atrasadas consultando em excesso**
   Onde: `src/hooks/useOverdueMeetings.ts:68-172`
   Combina `refetchInterval: 60s` + listener `visibilitychange` + realtime de UPDATE global. Somadas, as duas variantes representam ~1,33 milhão de chamadas.
   Correção: subir o intervalo para 5 min, remover o refetch do realtime global (ou filtrar por `closer_id`/`created_by`) e pausar o polling quando a aba está em background.

3. **Lista de Reuniões carrega 180 dias inteiros no cliente**
   Onde: `src/pages/ReunioesListPage.tsx:171-235`
   Pagina em blocos de 1000 até esgotar, traz ~20 colunas de milhares de linhas, e ainda baixa **a tabela `vendas` inteira** (`vendas-oferta-map`, sem filtro nenhum) para montar um Map. Filtros e ordenação acontecem em memória; a paginação de 20 é apenas visual.
   Correção: filtrar/ordenar/paginar server-side (`range` + filtros na query), restringir a janela padrão a 30-60 dias e limitar a busca de `vendas` aos IDs da página atual.

4. **Dashboard Comercial: 3 varreduras completas + fan-out de vendas, com polling de 2 min**
   Onde: `src/pages/DashboardComercialPage.tsx:193-290`
   `fetchAllAgendamentos` pode fazer até 50 requisições por query; a busca de vendas fatia os IDs em blocos de 500 (várias requisições em série); a chave de cache usa `vendaAgIds.length` (frágil: muda de conteúdo sem mudar a chave). Tudo isso repetido a cada 2 minutos, indefinidamente, em telas deixadas abertas.
   Correção: mover a agregação para RPCs no banco (como já é feito em `dashboard_conversao_period` / `dashboard_trend_*`), devolvendo números prontos em vez de linhas brutas; e aumentar/desligar o polling quando a aba não está visível.

### Moderados

5. **~20 `refetchInterval` simultâneos, sem pausa em background**
   Onde: `VendasTab.tsx` (4), `ErrosSDRTab`, `ErrosCloserTab`, `CargaClosersTab` (2), `AgendasPorCanalPanel`, `TrendCardSDR/Vendas`, `AguardandoAtribuicaoPage:70` (30 s), `AppLayout.tsx:85` (30 s), `useGoogleCalendar.ts:33`.
   Correção: padronizar em 5 min, definir `refetchIntervalInBackground: false` e ligar `staleTime` coerente no `QueryClient`.

6. **`DashboardPage.tsx` com 2.629 linhas e 59 hooks num único componente**
   Toda mudança de estado (hover, filtro, diálogo) re-renderiza a grade inteira do calendário, com 17 queries no mesmo arquivo.
   Correção: extrair a grade, os cards e os diálogos em componentes memoizados; separar os hooks de dados em arquivos próprios.

7. **`closer_blocks` e `vendas` com muitos seq scans** (641 mil e 767 mil varreduras sequenciais)
   Onde: `useSlotCounts.ts:41`, `DashboardPage.tsx:436` — o filtro `.or(and(...),and(...))` não usa índice.
   Correção: índice em `closer_blocks(block_date)` e revisão do predicado; as tabelas são pequenas hoje, então é otimização de custo, não de latência.

8. **Sem virtualização em listas longas**
   `@tanstack/react-virtual` está instalado mas nunca é usado. Telas com centenas de linhas renderizadas (drilldowns com `.range(0, 9999)` em `MetricDrilldownDialog.tsx:184`, `DashboardLeadsPage` com `limit(1000)`, `SdrPeriodComparisonCard` com dois `limit(5000)`) montam tudo de uma vez.
   Correção: virtualizar as tabelas grandes e reduzir os limites.

9. **Crescimento de `audit_logs` e `notifications` sem expurgo**
   211 MB + 113 MB, com 495 mil inserts em `audit_logs`. A consulta de status anterior (`DashboardPage.tsx:810-830`) tem média de 157 ms e é a mais lenta por chamada.
   Correção: rotina de retenção (ex.: 6 meses para logs, 90 dias para notificações lidas).

### Baixos

10. **Warning de `ref` em componente sem `forwardRef`** — `PendingMeetingsBanner` → `CancelReasonDialog` (`src/components/CancelReasonDialog.tsx:27`). Aparece nos logs do console a cada render; sem impacto funcional, mas polui e indica remount desnecessário.

11. **`setInterval` de 1 segundo** em `DashboardComercialPage.tsx:1458` (relógio) — já está isolado em `<LiveClock/>`, mas vale confirmar que não propaga render para a página.

12. **`gcTime: Infinity`** em `user-roles-map` e `profiles-name-map` (`DashboardPage.tsx`) — retém dados pela sessão inteira; pequeno, mas contribui para o crescimento de memória em abas de longa duração.

13. **`useMyCloserId` duplicado** — `MeusFollowsPage.tsx:11` refaz a mesma query com outra chave de cache (`my-closer-id-meus-follows`), furando o cache compartilhado.

14. **Consulta do token Google** — 484 mil chamadas em `GoogleCalendarBanner.tsx:44-55`, disparada por `focus` da janela sem debounce. Barato individualmente, mas desnecessário.

---

## Verificações que saíram limpas

- Build atual: OK, sem erros.
- Nenhum erro de runtime registrado.
- Políticas de RLS já otimizadas (`(select auth.uid())`, funções `SECURITY DEFINER`) — sem overhead por linha.
- Canais de realtime **são** removidos no cleanup (sem acúmulo de listeners); timers e `ResizeObserver` também têm cleanup correto.
- Índices principais existem e estão sendo usados.

## Recomendação de ordem de correção

Fase 1 (maior ganho, menor risco): itens 1, 2 e 5 — corta o realtime global e o polling. Deve reduzir o tráfego ao banco em ~80%.
Fase 2: itens 3 e 4 — filtros server-side na Lista de Reuniões e RPCs de agregação no Dashboard Comercial.
Fase 3: itens 6, 8, 9 — refatoração do DashboardPage, virtualização e retenção de dados.
Fase 4: itens 10-14 — limpeza.

Aguardando sua aprovação sobre quais itens corrigir e em qual ordem.
