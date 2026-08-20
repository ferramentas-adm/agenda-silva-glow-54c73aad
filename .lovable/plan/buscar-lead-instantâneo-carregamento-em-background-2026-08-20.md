# Buscar Lead instantâneo (carregamento em background)

Hoje a etapa 1 do "Novo Agendamento" só mostra algo depois que **toda** a base de leads com a tag "agendamento" termina de carregar (uma chamada única que pagina o DataCrazy inteiro no servidor). Enquanto isso o usuário vê apenas os 4 blocos cinza. Objetivo: o usuário digita e já vê resultados em ~1s, e nunca fica esperando a base inteira.

## O que muda para o usuário

1. **A lista abre com o que já estava em cache.** O resultado da última carga fica guardado no navegador, então ao entrar na tela a busca já está utilizável (com aviso discreto "atualizando…"), sem skeleton bloqueando.
2. **Carregamento em background, progressivo.** As páginas de leads chegam aos poucos: a primeira leva ~1s e a lista já exibe/filtra em cima dela, crescendo sozinha até completar. Não há mais tela travada até o fim.
3. **Busca direta no CRM enquanto digita.** A partir de 2 caracteres, com 350ms de debounce, o app pergunta ao CRM só pelos leads que casam com aquele nome/telefone (limite 25). Isso responde em ~1s mesmo se a base completa ainda estiver carregando, e os resultados são mesclados com os já carregados (sem duplicar).
4. **Pré-carregamento antecipado.** A base começa a carregar em background quando o usuário passa o mouse/toca no item "Agendar" do menu, então em muitos casos a tela abre já pronta.
5. **Nunca mais bloqueio para ir à etapa 2:** selecionar um lead vindo da busca rápida é suficiente para avançar.

## Detalhes técnicos

**Edge function `datacrazy-proxy`**
- Novo agregador `GET /leads/search-compact?tagId=…&q=…`: consulta o DataCrazy com o filtro de tag + termo (`filter[name]` / `filter[phone]`, conforme suportado pela API — validar; se o filtro por termo não existir, cair para varredura das 2 primeiras páginas), `limit=25`, e devolve o mesmo formato compacto `{id,name,phone,tags[]}`. Cache em memória de 60s por `tagId+q`.
- Novo agregador `GET /leads/by-tag-page?tagId=…&page=N`: devolve uma única página compacta + `count`, permitindo carga incremental pelo cliente. O `by-tag-compact` atual permanece (compatibilidade), mas deixa de ser o caminho da UI.
- `fetchWithRetry`: corrigir consumo duplicado de body no retry de 429 e adicionar `AbortSignal.timeout(20s)` por página, para uma página lenta não travar tudo.

**`src/services/datacrazy.ts`**
- `buscarLeadsPagina(tagId, page)` e `buscarLeadsPorTermo(tagId, q)`.
- A busca por termo entra em um caminho leve que **não** passa pela fila serializada global (ela existe para evitar 429 em escrita); mantém dedupe de GETs em voo e cancela requisições obsoletas.

**`src/components/agendar/LeadSearch.tsx`**
- Substituir a query única por `useInfiniteQuery` (ou loop controlado) que busca páginas em background com `persister` em `localStorage` (chave versionada por `tagId`, TTL 10 min) e `placeholderData` do cache.
- Remover o `if (isLoading) return <Skeleton/>` bloqueante: o campo de busca e a lista aparecem sempre; skeleton apenas nas linhas ainda não carregadas.
- Query paralela de busca por termo com `debounce 350ms`, `enabled: q.length >= 2`, mesclada por `id` com os leads locais já carregados; indicador "buscando no CRM…".
- Rodapé passa a mostrar "X de Y leads carregados" enquanto a carga em background avança.

**`src/components/AppLayout.tsx`**
- `onMouseEnter`/`onFocus` no link "Agendar" dispara `queryClient.prefetchQuery` da primeira página de leads.

Sem alterações de banco de dados.
