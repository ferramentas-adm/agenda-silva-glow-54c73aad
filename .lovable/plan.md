# Relatório: lentidão na aba "Novo Agendamento"

## Diagnóstico

O gargalo principal **não é o React** nem o Supabase — é a busca de leads no **DataCrazy**, feita no passo inicial da tela. Hoje:

- `LeadSearch` dispara `buscarLeadsComTagId()` (src/services/datacrazy.ts:117)
- Essa função pagina o endpoint `/leads` em páginas de 100, **sequencialmente**, até 5.000 leads
- Cada página passa pela edge function `datacrazy-proxy` (cold start + round-trip externo)
- O `useQuery` está com `staleTime: 0` + `refetchOnMount: "always"` (LeadSearch.tsx:54–55) → **toda visita re-baixa tudo**, sem cache

Com poucas centenas de leads marcados já são facilmente 6–15s. Esse é o motivo dos >10s.

Outros pontos secundários (não dominantes, mas somam):

- 3 `useQuery` independentes na própria página (`closers`, `sdr-users`, `agendamento-edit`) — OK, mas o de SDR faz 2 idas ao banco em série (`user_roles` → `profiles`).
- `useEffect` de autopreenchimento (AgendarPage.tsx:179) dispara uma query extra ao banco a cada seleção de lead.
- `CloserSelector` faz 3 queries por troca de data.
- Edge function `datacrazy-proxy` provavelmente sofre cold start (Deno) na primeira chamada.

## Plano de otimização (sem mudar funcionalidade)

### 1. Corrigir o cache da lista de leads (ganho maior, ~80% do problema)
Em `src/components/agendar/LeadSearch.tsx`:
- Remover `staleTime: 0` e `refetchOnMount: "always"`.
- Usar `staleTime: 5 * 60_000` (5 min) e `gcTime: 30 * 60_000`.
- Manter o botão "Atualizar" para forçar refetch manual (já existe via `invalidateQueries`).
- Adicionar `placeholderData: (prev) => prev` para a tela não piscar para o estado vazio durante refetch.

Resultado esperado: primeira visita continua igual, **demais visitas ficam instantâneas**.

### 2. Paralelizar/limitar paginação no DataCrazy
Em `src/services/datacrazy.ts` `buscarLeadsComTagId`:
- Fazer a 1ª chamada para obter `count`.
- Disparar as páginas restantes em **paralelo** com `Promise.all` (em lotes de 5).
- Reduzir o `MAX_LEADS` para um valor realista (ex.: 1000) — hoje 5000 é overkill.

Ganho: corta o tempo da primeira carga proporcionalmente ao nº de páginas (3–5×).

### 3. Prefetch e skeleton imediato
- Em `AppLayout`/rota, ao montar o item de menu "Novo Agendamento", chamar `queryClient.prefetchQuery(["datacrazy-leads-agendamento", tagId])` no hover/foco do link.
- Garantir que o passo `lead` já renderize o restante do formulário (steps, botões) imediatamente — só a lista mostra skeleton.

### 4. Reduzir queries em série na página
Em `AgendarPage.tsx`:
- Unir as duas queries de SDR em **uma RPC** (`get_sdr_users()`) que faz o join `user_roles` ⨝ `profiles` no banco — 1 round-trip em vez de 2.
- Combinar `closers-active` (já existe) com `closers-availability` reaproveitando dados em cache.

### 5. Aquecer a edge function `datacrazy-proxy`
- No `AppLayout`, após login, disparar um `supabase.functions.invoke("datacrazy-proxy", { body: { method: "GET", path: "/ping" } })` em background (fire-and-forget) para eliminar o cold start no primeiro clique do usuário.

### 6. Medições antes/depois
Adicionar `console.time`/`console.timeEnd` em torno de `buscarLeadsComTagId` durante o teste para confirmar o ganho. Remover depois.

## Estimativa de impacto

| Mudança | Esforço | Ganho esperado |
|---|---|---|
| 1. Cache do useQuery | 2 min | **-80% nas re-visitas** |
| 2. Paginação paralela | 15 min | -50–70% na 1ª carga |
| 3. Prefetch no menu | 10 min | percepção: 0s ao clicar |
| 4. RPC SDR | 20 min | -200–400ms |
| 5. Warm-up edge fn | 5 min | -300–800ms na 1ª chamada |

Total realista: tempo médio de **>10s** cai para **<1s** após a primeira visita e **2–4s** na primeira.

## Detalhes técnicos

- Arquivos tocados: `src/components/agendar/LeadSearch.tsx`, `src/services/datacrazy.ts`, `src/pages/AgendarPage.tsx`, `src/components/AppLayout.tsx` (prefetch), 1 migration para a RPC `get_sdr_users`.
- Sem mudanças de UI, sem mudança de comportamento de webhook, sem mudança de schema (exceto a RPC opcional).
- Sem dependência nova.

## Fora de escopo (mas observações)

- Cold start do Deno em edge functions só desaparece com tráfego frequente ou upgrade de instância (Lovable Cloud → Backend → Advanced settings).
- Se o DataCrazy expuser filtro server-side por nome/telefone, a longo prazo vale trocar "baixar tudo e filtrar local" por busca incremental — fora do escopo deste ajuste.
