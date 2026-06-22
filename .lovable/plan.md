## Acelerar a busca de leads do DataCrazy

A busca por leads com a tag `agendamento` ainda é lenta porque cada abertura/foco da tela refaz toda a paginação sequencial no DataCrazy (6+ requisições com gap de 350ms + jitter, sem cache compartilhado entre montagens/abas/usuários). Mesmo com menos leads, isso custa 3-5s a cada clique.

### O que vamos fazer (4 mudanças combinadas)

#### 1. Cache no edge `datacrazy-proxy` (maior ganho)
- Cache em memória por instância (Map com TTL de **60s**) para respostas de `GET /leads*` e `GET /tags`.
- Chave: `method + path`. Hits servem 200 sem chamar DataCrazy → 2º clique é instantâneo e a janela cobre múltiplos usuários/abas.
- Em 429 do upstream, ler `Retry-After` e tentar até 2x dentro da própria edge antes de devolver erro.

#### 2. Paginação concorrente no client
Em `src/services/datacrazy.ts → buscarLeadsComTagId`:
- 1ª página descobre `count` (quando vier).
- Demais páginas disparam em **lotes de 3 em paralelo** (com pequeno jitter), em vez de 1 em 1.
- Mantém o backoff exponencial para 429.
- Resultado: para 600 leads (6 páginas), cai de ~6×700ms ≈ 4,2s para ~2 lotes ≈ 1,5s.

#### 3. Cache do React Query mais agressivo + sem refetch agressivo
Em `src/components/agendar/LeadSearch.tsx` e em `AppLayout.tsx`:
- `staleTime: 60_000` (estava `0`).
- Remover `refetchOnMount: "always"` e `refetchOnWindowFocus: true`.
- Manter o botão "Atualizar" para refresh manual sob demanda.
- Resultado: abrir/voltar para a tela usa dados em cache instantaneamente; revalidação só quando expira ou pelo botão.

#### 4. Pré-carregar em background no login (warm cache)
- Em `AppLayout.tsx`, disparar `prefetchQuery(["datacrazy-leads-agendamento"])` logo após o login, em background. Quando o usuário entrar em "Agendar", os leads já estão prontos.

### Arquivos
- `supabase/functions/datacrazy-proxy/index.ts` — cache 60s + retry em 429 com `Retry-After`.
- `src/services/datacrazy.ts` — paginação concorrente em lotes de 3.
- `src/components/agendar/LeadSearch.tsx` — `staleTime` + remover refetch agressivo.
- `src/components/AppLayout.tsx` — prefetch em background + mesmo `staleTime`.

### Fora de escopo (posso fazer depois se precisar)
- Trocar paginação por busca server-side (`/leads?search=`) — exige confirmar se o DataCrazy retorna apenas leads com a tag `agendamento` no `search`, e mudaria a UX (busca on-type direto no servidor).
- Persistir cache em `localStorage` (PersistQueryClient) — só vale se quiser carregamento instantâneo entre recargas de página.
