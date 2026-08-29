# Busca de logs por usuário (caso "Nicolas Mendes")

## O que está acontecendo

Os logs existem. Consultei o banco: o Nicolas Mendes tem **8.394 registros** em audit_logs (de 07/08/2026 a 29/08/2026, o mais recente hoje às 15:30 BRT).

O problema é a tela de Audit Logs: o campo "Buscar por usuário ou ação..." filtra **apenas as linhas da página atual** (20 por padrão), em memória. Como a base tem 668 mil registros ordenados por data, a primeira página raramente contém o nome buscado — e o resultado aparece como "Nenhum log encontrado".

Detalhe adicional: parte dos registros antigos foi gravada sem `user_email` (438 dos 8.394 têm e-mail), então a busca precisa considerar o nome também, não só o e-mail.

## O que vou mudar

1. **Busca no servidor**: o texto digitado passa a ser aplicado direto na consulta ao banco (nome do usuário e e-mail), com debounce, em vez de filtrar só a página carregada. A paginação e a contagem total passam a refletir o filtro.
2. **Filtro por usuário (dropdown)**: novo seletor com a lista de usuários do sistema, para filtrar os logs de uma pessoa específica sem depender de digitar o nome exato.
3. **Busca por detalhes**: o texto continua também procurando dentro do conteúdo do log (ex.: nome do lead), agora no banco.
4. **Estado vazio mais claro**: quando não houver resultado com filtros ativos, indicar que é por causa dos filtros e oferecer "limpar filtros".

## Detalhes técnicos

- `src/pages/AuditLogsPage.tsx`: incluir `search` (com debounce ~350ms) e `userFilter` na `queryKey` e na query Supabase, usando `or("user_name.ilike.%x%,user_email.ilike.%x%,details::text.ilike.%x%")`; remover o `useMemo` que filtra client-side; resetar `page` ao mudar filtros.
- Lista de usuários do dropdown via `profiles` (`user_id`, `full_name`), ordenada alfabeticamente; filtro aplicado com `eq("user_id", ...)`.
- Se a busca em `details` ficar lenta, restringir o `or` a `user_name`/`user_email` e manter `details` como busca opcional.
