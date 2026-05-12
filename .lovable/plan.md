## Faixa de pendências de status — reuniões em aberto de dias passados

Lembrete persistente para que ninguém termine o dia (ou comece o seguinte) com reuniões antigas ainda em `agendada` ou `confirmada`.

### Regra de pendência

Reunião está **pendente** quando:
- `scheduled_date < hoje` (no fuso America/Sao_Paulo), e
- `status` ∈ (`agendada`, `confirmada`), e
- `deleted_at IS NULL`.

### Quem vê o quê

| Papel | Escopo |
|---|---|
| **SDR** | Pendências cujo `created_by = SDR logado` |
| **Closer** | Pendências cujo `closer_id` corresponde ao closer do usuário (via `closers.email = auth.email()`) |
| **Gestor / Moderador** | **Todas** as pendências (visão agregada da empresa) |

### UX da faixa

- Componente novo `PendingMeetingsBanner` exibido no topo do `AppLayout` (aparece em todas as páginas internas).
- Cor vermelha/destrutiva, não dispensável (sem botão "fechar"), some sozinha quando zera.
- Texto:
  - SDR/Closer: *"Você tem N reunião(ões) de dias passados ainda em aberto. Resolva agora."*
  - Gestor/Moderador: *"N reuniões de dias passados ainda em aberto na empresa. Ver lista."*
- Clique abre um **diálogo (`Dialog`)** com lista das pendências:
  - Colunas: data, hora, lead, closer, SDR criador, status atual, ação rápida.
  - Para SDR/Closer: ação rápida com botões para mudar status (`Realizada` / `No-show` / `Cancelada`) inline (closer já tem permissão; SDR usa as mesmas regras de RLS atuais).
  - Para Gestor/Moderador: lista agrupada por closer, mostrando contagem por pessoa, com link "Ver no calendário do dia X" que navega para `/dashboard?date=...`.

### Detalhes técnicos

**Novo hook** `src/hooks/usePendingMeetings.ts`:
- `useQuery` que busca `agendamentos` com filtro acima.
- Aplica escopo conforme `role` do `useAuth` + `myCloserId` (mesmo padrão usado em `DashboardPage`).
- `refetchInterval: 5 min`, `staleTime: 2 min`.
- Retorna `{ pendings: Agendamento[], count, byCloser: Map<closerId, count> }` (último só usado pelo gestor).

**Novo componente** `src/components/PendingMeetingsBanner.tsx`:
- Usa o hook acima.
- Não renderiza nada se `count === 0`.
- Renderiza faixa + dialog com a lista.

**Integração** em `src/components/AppLayout.tsx`:
- Importa e renderiza `<PendingMeetingsBanner />` logo abaixo do header e acima do `<Outlet />` / `children`.

**Fuso**: usar `formatBRDate(new Date())` de `src/lib/timezone.ts` para obter "hoje" em `America/Sao_Paulo` e comparar com `scheduled_date` (`YYYY-MM-DD`). Sem `new Date().toISOString().slice(0,10)`.

**Permissões**: as RLS atuais já permitem que cada papel veja/atualize o que precisa. Sem mudança no banco.

**Auditoria**: ações de mudança de status pelo dialog usam o mesmo `logAudit("update_status", ...)` já usado em `DashboardPage`, para registrar quem resolveu a pendência.

### Não inclui (escopo fechado)

- Sem cron / e-mail / push (pode ser fase 2).
- Sem auto-marcar como `no_show`.
- Sem modal bloqueante no login (apenas faixa persistente, suficiente para o que o usuário pediu).