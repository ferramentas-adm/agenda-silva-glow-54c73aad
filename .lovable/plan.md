## Ajuste dos cards do Calendário (`/dashboard`)

Hoje os cards "Total SDRs" e "Total Closers" não refletem o que o nome diz. Vamos alinhar com o painel comercial.

### Mudanças

1. **Card "Total SDRs"** — passa a contar **somente** agendas do dia criadas por usuários com role `sdr` (mesma regra do painel Métricas SDRs). Hoje conta tudo, por isso aparecia 42 em vez de 37.

2. **Card "Total Closers"** — passa a contar **todas** as agendas do dia criadas por usuários com role `closer` (qualquer status: agendada, confirmada, realizada, etc.). Hoje só contava as `realizada`.

3. **Novo card "Closer Realizada"** — adicionado ao lado do "Total Closers". Conta só as agendas do dia criadas por closers e com status `realizada` (regra antiga do "Total Closers").

### Detalhes técnicos

Arquivo único: `src/pages/DashboardPage.tsx`

- `totalSdrCount` (linha ~334): adicionar filtro `creatorRole === 'sdr'` usando o `userRolesMap` já existente.
- `closerCreatedCount` (linha ~351): remover o filtro `status === 'realizada'`, manter só `creatorRole === 'closer'` + `TOTAL_STATUSES`.
- Criar `closerRealizadaCount`: closers + `status === 'realizada'`.
- Adicionar novo card "Closer Realizada" na grid (linha ~707), ajustar `xl:grid-cols-9` → `xl:grid-cols-10` para Admin/Mod/SDR.
- Ícone sugerido para o novo card: `CheckCircle2` em verde (mesmo padrão das Realizadas).

Não muda nada na visão de Closer (`isCloserView`) — só afeta Admin/Moderador/SDR.

### Resultado esperado para hoje

- Total SDRs: **37** (igual ao painel comercial)
- Total Closers: **5** (André + Neto)
- Closer Realizada: 0 (nenhuma marcada como realizada ainda)
- Realizadas (geral): inalterado