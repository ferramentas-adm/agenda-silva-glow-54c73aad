## Causa
O overlay `OverdueMeetingsLockOverlay` (z-[100], renderizado no `AppLayout`) cobre a tela inteira em todas as rotas. Resultado:
- **Cancelar**: `CancelReasonDialog` abre em z-50, atrás do overlay → parece não fazer nada.
- **Reagendar**: `navigate("/agendar?edit=...")` funciona, mas o overlay continua por cima da `AgendarPage`, bloqueando o formulário.

## Solução (sem modais — só redirecionamento)

### 1. Nova rota `/cancelar-reuniao/:id`
- Criar `src/pages/CancelarReuniaoPage.tsx`: página simples com nome do lead, horário, campo "Motivo *" (1 linha, max 200), botão **Confirmar cancelamento** e **Voltar**.
- Ao confirmar: mesmo update de `status='cancelada' + cancellation_reason`, `logAudit('update_status', ...)`, invalida queries (`overdue-meetings`, `agendamentos`, `pending-meetings`) e `navigate(-1)`.
- Registrar em `src/App.tsx` dentro de `<ProtectedRoute>`.

### 2. Botão "Cancelada" do overlay vira redirect
- Em `src/components/OverdueMeetingsLockOverlay.tsx`: remover `CancelReasonDialog` e o estado `cancelTarget`. O botão **Cancelada** chama `navigate(\`/cancelar-reuniao/${m.id}?lead=${...}\`)`.

### 3. Esconder overlay nas rotas de ação
- Em `OverdueMeetingsLockOverlay`, ler `useLocation()`. Se pathname começar com `/agendar`, `/cancelar-reuniao`, `/venda/`, ou for `/lead-detalhes*`, retornar `null`. Isso libera as telas para onde os botões redirecionam (Reagendar, Cancelar, Realizada e "Ver detalhes do cliente").

### 4. Limpeza
- Remover import e uso de `CancelReasonDialog` do `OverdueMeetingsLockOverlay`. (O componente continua sendo usado em `PendingMeetingsBanner` — mantido.)

## Arquivos
- novo: `src/pages/CancelarReuniaoPage.tsx`
- editar: `src/App.tsx` (rota lazy)
- editar: `src/components/OverdueMeetingsLockOverlay.tsx` (redirect + hide nas rotas de ação)

## Por que não quebra nada
- Nenhuma mudança de banco/RLS — mesma mutação, só muda o local da UI.
- `CancelReasonDialog` segue funcionando em outros contextos (banner de pendentes, drilldown).
- Overlay continua bloqueando todas as outras telas; só libera as 4 rotas onde a ação está sendo executada.
