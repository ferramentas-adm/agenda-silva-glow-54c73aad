# Acesso completo do Claude ao painel via conector MCP

O painel já tem um servidor MCP com login (OAuth) e 3 ferramentas de leitura: reuniões, closers e detalhes de uma reunião. O plano amplia esse mesmo conector para cobrir "tudo": vendas, follow-ups, não comparecimento, produtividade de SDR, usuários e busca de lead. O Claude conecta uma vez, faz login com a conta do painel e passa a consultar em linguagem natural.

Cada ferramenta continua respeitando exatamente a permissão do usuário que conectou (gestor vê tudo, closer vê o dele), porque as consultas usam o token do login.

## Novas ferramentas

1. `list_sales` — vendas do período: closer, lead, valor, order bumps, origem (1ª call ou follow-up), data de fechamento. Filtros: período, closer, apenas vendas fechadas ou também perdidas.
2. `sales_kpis` — números consolidados do período: vendas, faturamento, ticket médio, reuniões realizadas e taxa de conversão.
3. `closer_performance` — ranking por closer: reuniões realizadas, vendas, valor e conversão (inclui quem ficou em zero).
4. `list_followups` — follow-ups em acompanhamento e reuniões sem follow-up marcado, com data, motivo do não fechamento, valor previsto e sinalização de atraso.
5. `no_show_reasons` — motivos de não comparecimento agrupados no período, com contagem e percentual, opcionalmente por SDR.
6. `sdr_productivity` — agendamentos criados por SDR no período, com comparecimento e conversão dos agendamentos dele.
7. `agenda_availability` — ocupação da agenda por dia/horário: horários lotados e os mais vazios, respeitando os horários comerciais configurados.
8. `search_lead` — busca lead por nome ou telefone e devolve o histórico de reuniões e vendas dele.
9. `list_users` — usuários do painel com função (gestor, moderador, SDR, closer) e status ativo/inativo. Somente gestor/moderador recebe dados; para os demais retorna acesso negado.

As 3 ferramentas atuais são mantidas, com melhoria: `list_appointments` passa a incluir o nome do closer e do SDR (hoje devolve só os IDs) e aceita filtro por closer/SDR.

## Detalhes técnicos

- Novo `src/lib/mcp/supabase.ts` com o factory único (`supabaseForUser`) resolvendo env em runtime; as ferramentas existentes passam a usá-lo em vez de duplicar `createClient`.
- Um arquivo por ferramenta em `src/lib/mcp/tools/`, registradas em `src/lib/mcp/index.ts` (`defineMcp`), sem mudar o bloco `auth` OAuth já existente.
- Reaproveitar as RPCs agregadas já existentes onde couber: `dashboard_vendas_kpis`, `dashboard_vendas_closer_perf`, `dashboard_vendas_motivos`, `dashboard_vendas_realizadas_sem_closer` — assim os números do Claude batem com a página "Vendas" e não estouram o limite de 1000 linhas.
- Follow-ups, não comparecimento e produtividade de SDR consultam `vendas` / `agendamentos` com filtros por data em America/Sao_Paulo, mesma regra de exclusão de registros deletados usada na UI.
- Todo resultado devolve `structuredContent` além do texto, com limite máximo de itens por chamada para manter as respostas rápidas.
- Nenhuma mudança de schema; todas as ferramentas são somente leitura.
- Ao final: regenerar o manifesto MCP e fazer o deploy da função `mcp`, depois te passo a URL do conector para colar no Claude.
