# Queda do sistema — 20/08/2026, ~18:35 às 19:00 (horário de Brasília)

## O que aconteceu (confirmado nos logs)

O login e a renovação de sessão pararam de responder. Nos registros de autenticação aparecem, na janela do incidente, erros como `context deadline exceeded` em `/token` (login) e dezenas de `failed to connect to ... user=supabase_auth_admin ... operation was canceled` em `/user`. Ou seja: **o serviço de autenticação ficou sem conseguir falar com o banco** — por isso a tela simplesmente não abriu para ninguém, mesmo com o banco e a aplicação "de pé".

No mesmo intervalo, a integração de Google Agenda disparou uma avalanche de chamadas: 143, 144, 190, 167, 165 e 52 chamadas por minuto, sendo **97 delas estouradas no tempo limite de 150 segundos** (erro 504) e 6 com erro 503. Cada uma dessas chamadas mantém abertas conexões com o banco durante os 150 segundos.

Agora (19:00) o banco voltou ao normal: 44 conexões, fila de webhooks zerada, backend respondendo.

## Causa raiz

A tela "Calendário" faz **uma chamada separada por closer** para buscar a agenda do Google. Com ~20 closers selecionados, cada operador com a tela aberta gera ~20 chamadas simultâneas, e isso se repete a cada 5 minutos e a cada troca de dia/seleção. Com vários operadores online, chega a ~180 chamadas por minuto.

Essa função **não tem tempo limite na chamada ao Google**. Quando o Google ficou lento, cada chamada travou por 150 segundos segurando conexão com o banco. O acúmulo esgotou a capacidade de conexão, e o serviço de autenticação — que disputa o mesmo banco — ficou sem conseguir conectar. Resultado: ninguém consegue entrar.

Em resumo: não foi o banco que caiu nem uma alteração de estrutura; foi **excesso de chamadas simultâneas ao Google Agenda sem tempo limite**, que sufocou a autenticação.

## Problemas encontrados, por severidade

### Crítico — causa da queda
1. **Sem tempo limite na chamada ao Google** (`supabase/functions/google-calendar-events/index.ts`): as duas chamadas externas (renovar token e buscar eventos) não têm `AbortSignal.timeout`. Correção: 8 s para o token, 10 s para os eventos, respondendo "não conectado" em caso de estouro.
2. **Uma chamada por closer, todas ao mesmo tempo** (`src/pages/DashboardPage.tsx`, bloco `google-busy-blocks`): `Promise.allSettled` dispara ~20 chamadas de uma vez. Correção: enviar a lista de closers em **uma única chamada** (a função passa a aceitar `closer_ids[]` e resolve em lotes internos, com tempo limite por closer).
3. **Sem proteção contra repetição em falha**: a consulta não define `retry` nem `refetchOnWindowFocus`. Em cenário de lentidão, cada troca de aba multiplica a avalanche. Correção: `retry: 0`, `refetchOnWindowFocus: false` e intervalo de atualização só com a aba visível.

### Moderado
4. **Busca de lead quebrada por consumo duplo do corpo da resposta** (`supabase/functions/datacrazy-proxy/index.ts`, `fetchWithRetry` linha 75 + uso na linha 181): quando o DataCrazy responde 429 (limite de uso), a função lê o corpo para descartar e, esgotadas as tentativas, devolve essa mesma resposta já consumida — daí o erro `TypeError: Body already consumed` registrado hoje 7 vezes. Correção: `fetchWithRetry` passa a devolver o texto já lido, e o chamador usa esse texto. Efeito colateral do 429: o DataCrazy está limitando nosso volume — reduzir o paralelismo de 5 para 3 nas páginas.
5. **Nenhuma degradação suave na tela**: se a agenda do Google falha, o operador não recebe nenhum aviso e pode agendar sobre um horário ocupado. Correção: aviso discreto de "agenda do Google indisponível" no topo do calendário.

### Baixo
6. **26 erros de chave duplicada em `vendas_agendamento_id_key`** no banco hoje: alguém clicou duas vezes em salvar o resultado da reunião, ou tentou registrar resultado de uma reunião que já tinha. Não derrubou nada, mas gera erro na tela do closer. Correção: tratar esse caso específico como atualização do registro existente, com mensagem clara.

## Detalhes técnicos das mudanças

- `supabase/functions/google-calendar-events/index.ts`: aceitar `closer_ids: string[]` (mantendo compatibilidade com `closer_id`), buscar tokens em uma consulta, processar em lotes de 5 com `AbortSignal.timeout`, e devolver `{ results: [{ closer_id, connected, expired, events }] }`.
- `src/hooks/useGoogleCalendar.ts` e `src/pages/DashboardPage.tsx`: uma única invocação com a lista de closers; `retry: 0`, `refetchOnWindowFocus: false`, `refetchIntervalInBackground: false`.
- `supabase/functions/datacrazy-proxy/index.ts`: `fetchWithRetry` devolve `{ res, text }`; `CONCURRENCY` de 5 → 3.
- `src/components/VendaDialog.tsx`: tratar violação de unicidade (código `23505`) como atualização.

Nenhuma alteração de estrutura de banco, política de acesso ou regra de negócio é necessária.
