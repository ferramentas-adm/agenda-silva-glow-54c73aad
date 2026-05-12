## Objetivo

Quando um lado clica em "Enviar para o Closer" ou "SDR vai atualizar", a tela do outro lado precisa travar **na hora**. E cada reunião só pode ser repassada **uma única vez** — quem recebeu não pode devolver.

## Por que hoje não funciona

Os botões salvam só em `localStorage` do próprio usuário. O outro lado só descobre via polling de 60s (e em alguns casos nunca trava se a aba está em background). Solução: mover a dispensa para o banco, com realtime.

## Mudanças

### 1. Banco — duas colunas em `agendamentos` (aditivo, nullable)

```sql
ALTER TABLE public.agendamentos
  ADD COLUMN sdr_handoff_at    timestamptz,
  ADD COLUMN closer_handoff_at timestamptz;
```

Sem default, sem trigger, sem alteração de RLS. Realtime já está ativo na tabela.

### 2. Regra de envio único

- SDR só vê "Enviar para o Closer" se `sdr_handoff_at IS NULL` **e** `closer_handoff_at IS NULL`.
- Closer só vê "SDR vai atualizar" se `closer_handoff_at IS NULL` **e** `sdr_handoff_at IS NULL`.
- Quem recebeu o handoff continua com os botões reais (Realizada / No-show / Cancelada / Reagendar) e só destrava mudando o status no banco.

### 3. Filtro no `useOverdueMeetings`

- Incluir `sdr_handoff_at` e `closer_handoff_at` no select.
- Substituir o filtro local por `localStorage` por:
  - Sou SDR (`m.created_by === user.id`) e `sdr_handoff_at` setado → some do meu overlay.
  - Sou Closer (`m.closer_id === myCloserId`) e `closer_handoff_at` setado → some do meu overlay.
- Remover helpers `addDismissed/readDismissed/writeDismissed/overdueDismissKey` e seus usos.

### 4. `OverdueMeetingsLockOverlay`

- `handleDismiss` passa a fazer `UPDATE agendamentos SET sdr_handoff_at = now()` (ou `closer_handoff_at = now()`). RLS atual já permite SDR criador e Closer responsável.
- Mantém `logAudit` e toast atuais.
- Renderização condicional dos botões de envio conforme as duas colunas.
- Realtime existente (`overdue-meetings-realtime` escutando UPDATE em `agendamentos`) já invalida o cache do outro lado em <1s.

## Por que não quebra nada em produção

- Migração apenas adiciona duas colunas nullable. Nenhum INSERT existente precisa ser alterado.
- Nenhuma trigger existente lê essas colunas. As triggers `notify_status_change`, `notify_crm_sync`, `notify_status_change_webhook` só disparam em mudança de `status` ou `deleted_at` — UPDATEs de handoff não vão acionar webhook nem CRM sync.
- RLS de UPDATE em `agendamentos` não muda.
- Botões existentes (Realizada / No-show / Cancelada / Reagendar) ficam intactos.
- Pior caso (banco lento): o botão demora alguns ms para responder; nada quebra.

## Arquivos

- **Migração**: `agendamentos.sdr_handoff_at`, `agendamentos.closer_handoff_at`.
- `src/hooks/useOverdueMeetings.ts`: incluir colunas no select; trocar filtro localStorage por filtro nas colunas; remover helpers.
- `src/components/OverdueMeetingsLockOverlay.tsx`: `handleDismiss` faz UPDATE no banco; renderização condicional dos botões.
