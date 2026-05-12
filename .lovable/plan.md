## Trava de tela para reuniões não atualizadas

### Regra
Uma reunião está **vencida e exige ação** quando, **agora (BRT) ≥ scheduled_date + scheduled_time + 1h05**, e o status ainda é `agendada` ou `confirmada`, e `deleted_at IS NULL`.

Status que liberam: `realizada`, `no_show`, `cancelada`, **`reagendada`**.

### Quem trava
Apenas as duas pessoas envolvidas naquela reunião:
- **SDR criador** (`created_by = auth.uid()`)
- **Closer** (`closer_id` casa com `closers.email = auth.email()`)

Gestor, Moderador e demais usuários **não** são travados (continuam vendo só o banner já existente).

Quando qualquer um dos dois (SDR ou Closer) atualizar o status, a trava cai para ambos automaticamente.

### UX
Novo componente `OverdueMeetingsLockOverlay` montado no `AppLayout`, acima de tudo:
- Se houver ≥1 reunião vencida no escopo do usuário, renderiza um **overlay full-screen bloqueante** (`fixed inset-0 z-[100]`, `bg-background/95 backdrop-blur`), **sem botão fechar, sem ESC, sem clique fora**.
- Conteúdo:
  - Título destrutivo: *"Atualize as reuniões vencidas para continuar"*.
  - Texto explicativo curto com a regra (1h05 após o horário agendado).
  - Lista das reuniões pendentes (data, hora, lead, papel do outro lado).
  - Botões inline por reunião: **Realizada**, **No-show**, **Cancelada**, **Reagendar**.
    - "Realizada" abre o `VendaDialog` já existente.
    - "Cancelada" pede justificativa (mesmo padrão de `DashboardPage`).
    - "No-show" atualiza direto.
    - "Reagendar" leva para o fluxo de reagendamento existente (mesma rota usada hoje).
  - Cada ação registra `logAudit("update_status", ...)`.
- Overlay desaparece sozinho quando `count === 0`.

### Detalhes técnicos

**Novo hook** `src/hooks/useOverdueMeetings.ts`:
- `useQuery` em `agendamentos`, filtros: `deleted_at IS NULL`, `status IN ('agendada','confirmada')`, `scheduled_date >= ontem` (cobre virada de dia em BRT).
- Escopo por papel:
  - `sdr` → `created_by = user.id`
  - `closer` → `closer_id = myCloserId`
  - Usuário com SDR+Closer (caso Vick) → `or(created_by.eq.<id>, closer_id.eq.<myCloserId>)`
  - Gestor / Moderador → lista vazia (não trava)
- Filtra no client mantendo só as cuja `scheduled_date + scheduled_time + 1h05` (em BRT) já passou — usa helpers de `src/lib/timezone.ts`.
- `refetchInterval: 60_000` + revalida em `visibilitychange`.
- Realtime opcional: subscribe em `postgres_changes` na tabela `agendamentos`.

**Cálculo do "vencida"**:
- Monta string `${scheduled_date}T${scheduled_time}:00` interpretada em BRT, soma 65 min, compara com `brPartsOf(new Date())`. Sem `Date.parse` direto.

**Novo componente** `src/components/OverdueMeetingsLockOverlay.tsx`:
- Usa o hook + `VendaDialog` + diálogo de justificativa para cancelamento.
- `Dialog` shadcn com `onOpenChange` no-op, sem `DialogClose`, mantém aberto enquanto `count > 0`.

**Integração** em `src/components/AppLayout.tsx`:
- Renderiza `<OverdueMeetingsLockOverlay />` no topo do JSX, irmão do `<aside>`, cobrindo sidebar e conteúdo.
- Login / reset / force-change-password não usam `AppLayout`, então já estão fora.

**Sem mudanças de banco**: RLS atual já permite SDR criador e Closer atualizarem status. Sem migração.

### Fora de escopo
- Notificação push / email.
- Auto-marcar como no-show.
- Travar gestor/moderador.
- Reuniões de dias anteriores ao de ontem (continuam só no banner `PendingMeetingsBanner`).