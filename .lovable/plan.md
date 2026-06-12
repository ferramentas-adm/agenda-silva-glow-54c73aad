## Diagnóstico

A lista de leads do painel **Novo Agendamento** (`src/components/agendar/LeadSearch.tsx`) é carregada via React Query usando estas opções:

```ts
staleTime: 5 * 60_000,        // 5 minutos
gcTime: 30 * 60_000,
refetchOnMount: false,
refetchOnWindowFocus: false,
placeholderData: (prev) => prev,
```

Resultado: quando a Bruna adiciona a tag **"agendamento"** no DataCrazy e abre a tela de Novo Agendamento, o React Query devolve a lista que ficou em cache na sessão dela (até 5 minutos atrás) — o lead novo só aparece se:
- passarem 5 minutos, **ou**
- ela clicar manualmente no botão "Atualizar" (ícone de refresh ao lado do filtro).

Não é problema de permissão, RLS ou tag — é cache do front-end. A query é a mesma para todos os usuários (`queryKey: ["datacrazy-leads-agendamento", tagId]`), então o cache pode inclusive ter sido populado por outro usuário antes.

Confirmações secundárias:
- O endpoint do DataCrazy é chamado com `filter[tags]=<tagId>` e paginação serial — funciona corretamente.
- Leads sem telefone aparecem na lista mas ficam desabilitados (com tooltip "Lead sem telefone"). Se o lead da Bruna estiver sem telefone no DataCrazy, esse é um segundo motivo possível — mas o sintoma seria "aparece cinza/não-clicável", não "some".

## O que vou fazer

Tornar a lista sempre fresca ao abrir o painel, sem precisar clicar em "Atualizar":

1. **`src/components/agendar/LeadSearch.tsx`**
   - Reduzir `staleTime` para `0` (ou ~15 s) e ativar `refetchOnMount: "always"` + `refetchOnWindowFocus: true`. Assim, toda vez que a SDR entra na tela ou volta para a aba, a lista é re-buscada do DataCrazy.
   - Manter `placeholderData: (prev) => prev` para não piscar a UI durante o refetch (mostra a lista antiga + spinner discreto).
   - Adicionar um texto pequeno "Atualizado há Xs" ao lado do botão Atualizar, para a SDR ter feedback claro de quando foi a última sincronização.
   - Melhorar a mensagem do estado vazio: quando o filtro digitado não encontra ninguém, sugerir explicitamente "Clique em Atualizar — pode levar alguns segundos após adicionar a tag no DataCrazy".

2. **Aviso de lead sem telefone (defensivo)**
   - Se a busca local encontrar o nome mas o lead estiver com telefone vazio, mostrar um aviso destacado em vermelho ("Esse lead está sem telefone no DataCrazy — cadastre o telefone lá para conseguir agendar"), em vez de só desabilitar silenciosamente.

Nenhuma mudança de backend, RLS ou edge function é necessária.

## Detalhes técnicos

- Arquivo alterado: `src/components/agendar/LeadSearch.tsx` (apenas opções do `useQuery` e pequenos ajustes de UI).
- O dedupe global em `src/services/datacrazy.ts` (`inFlightGets` + `apiChain`) já evita múltiplas chamadas paralelas, então ativar `refetchOnMount` não vai causar enxurrada de requests ao DataCrazy.
- Como o gap entre chamadas serializadas é de 250 ms e a lista tem paginação de 100 por página, o refetch completo continua leve.

## Fora de escopo

- Não vou mexer na lógica de paginação nem no proxy do DataCrazy.
- Não vou reduzir o cap de 5000 leads.
- Se depois do deploy a Bruna ainda não vir o lead específico, o próximo passo é checar diretamente no DataCrazy se aquele lead tem mesmo a tag `agendamento` e um telefone preenchido — isso é dado externo que o painel não consegue forçar.
