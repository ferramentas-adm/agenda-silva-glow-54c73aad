## Mudanças (aditivas, sem risco para produção)

### 1. Botão "Enviar para o Closer" no overlay (lado SDR)

Em `src/components/OverdueMeetingsLockOverlay.tsx`, no bloco visível quando `isSdrOfThis`, adicionar botão **"Enviar para o Closer"** (ícone `Send`) ao lado de No-show / Cancelada / Reagendar.

Comportamento:
- Não chama API. Adiciona `m.id` num `Set` salvo em `localStorage` na chave `overdue-dismissed-sdr:{user.id}`.
- Dispara `refetch()` do hook → reunião some do overlay para esse SDR.
- Toast: "Reunião enviada para o Closer atualizar".
- `logAudit("sdr_dismiss_overdue", "agendamento", m.id, { lead_name, closer_name })`.

### 2. Botão "SDR vai atualizar" no overlay (lado Closer)

No bloco visível quando `isCloserOfThis`, adicionar botão **"SDR vai atualizar"** (ícone `UserCheck`) ao lado de Realizada.

Comportamento simétrico:
- Adiciona `m.id` em `localStorage` chave `overdue-dismissed-closer:{user.id}`.
- `refetch()` → some do overlay para esse Closer.
- Toast: "Aguardando atualização do SDR".
- `logAudit("closer_dismiss_overdue", ...)`.

### 3. Filtro local no `useOverdueMeetings`

Em `src/hooks/useOverdueMeetings.ts`, depois de calcular `overdue`:
- Ler os dois sets do `localStorage`.
- Remover ids que estejam no set correspondente ao papel do usuário atual.
- Após filtrar, regravar o set mantendo só ids que ainda existem em `overdue` (auto-limpeza — quando o outro lado finalmente atualiza o status no banco, o id some daqui também).

### 4. Aba "Em acompanhamento" — mostrar Motivo e Explicação

Em `src/pages/FollowUpsPage.tsx`, na lista de follow-ups (`vendeu = false` AND `follow_up = true`), além do "Resumo:" já existente, exibir quando preenchidos:
- **Motivo:** `motivo_nao_fechamento`
- **Explicação:** `explicacao_nao_fechamento`

Mesmo padrão visual do `NaoAcompanhadosPanel` (label `font-semibold text-muted-foreground`, `whitespace-pre-wrap`).

## Impacto em produção

- Sem migração de banco, sem RLS, sem edge function, sem webhook.
- Nenhum botão ou fluxo existente é alterado — só somam dois botões novos.
- Quem não clicar neles vê o sistema exatamente como hoje.
- Pior caso: localStorage não funciona → botões viram no-op visual, nada quebra.
