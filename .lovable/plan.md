# Closer pode devolver a reunião vencida para o SDR

## O problema

Na trava de reuniões vencidas, quando o SDR encaminha a agenda ("Encaminhar para o Closer"), o Closer fica preso com apenas duas saídas: **Realizada** ou **Transferir para outro closer**. Se a reunião não aconteceu com ele (ex.: o SDR remanejou o lead para outro closer), o Closer não tem opção correta — acaba marcando no-show ou transferindo para um closer aleatório, sujando os dados.

## Como fica

Na etapa do Closer, o botão "Transferir para outro closer" é substituído por **"Não fui eu que atendi"**. Não há escolha de closer — o Closer A quase nunca sabe quem atendeu, e um chute erraria o histórico.

Ao clicar, ele escreve uma observação curta (opcional) e confirma. A reunião volta para o **SDR responsável**, que é quem mandou o link e sabe quem atendeu, e o Closer A é liberado na hora.

Continua existindo "Realizada" para quando a reunião foi dele mesmo.

- Do lado do SDR, a agenda reaparece com as opções dele (Cancelar, No-show, Reagendar) e o aviso "Devolvida pelo Closer <nome>" com a observação, se houver. Cabe a ele remanejar o lead para o closer correto (pela agenda) ou fechar o status.
- O SDR não pode encaminhar de volta ao mesmo Closer nessa segunda rodada: o botão "Encaminhar para o Closer" fica oculto quando a reunião já foi devolvida.
- A devolução gera notificação para o SDR responsável e registro no histórico (auditoria), para o gestor enxergar o vaivém.

Também corrige um ponto correlato: hoje a etapa SDR só considera **quem criou** a agenda. Passa a considerar também o **SDR responsável** (`sdr_responsavel_id`) — assim a devolução chega na pessoa certa mesmo quando a agenda foi criada por outra pessoa.


## Detalhes técnicos

- Migração em `public.agendamentos`: novas colunas `closer_returned_at timestamptz` e `closer_return_reason text` (nullable). A coluna `closer_handoff_at` já existente continua sem uso nesse fluxo.
- `src/hooks/useOverdueMeetings.ts`:
  - Buscar `closer_returned_at, closer_return_reason, sdr_responsavel_id` no select e incluí-los em `OverdueMeeting`.
  - `orParts` passa a incluir `sdr_responsavel_id.eq.${user.id}`; o filtro de etapa SDR passa a aceitar `created_by === user.id || sdr_responsavel_id === user.id`.
  - Nova regra de `stage`: se `closer_returned_at` estiver preenchido → `"sdr"` (independente de `sdr_handoff_at`); senão mantém a lógica atual (`both` quando o criador é o próprio closer, `closer` quando há `sdr_handoff_at`, caso contrário `sdr`).
  - Filtro realtime ganha `sdr_responsavel_id=eq.${user.id}`.
- `src/components/OverdueMeetingsLockOverlay.tsx`:
  - Novo botão "Devolver para o SDR" na etapa Closer, abrindo um campo de motivo (Input) + confirmar. Handler faz `update({ closer_returned_at: now, closer_return_reason: motivo, sdr_handoff_at: null })` em `agendamentos` filtrando por `id`, validando `data.length > 0` como os outros handlers (RLS de UPDATE já permite closer da agenda), depois `logAudit` (`services/auditLog.ts`) com ação `closer_return_to_sdr` e `invalidateAll()`.
  - Insere notificação em `public.notifications` para `sdr_responsavel_id ?? created_by`, tipo `closer_returned_meeting`.
  - Na etapa SDR: mostrar aviso "Devolvida pelo Closer: <motivo>" quando `closer_returned_at` existir, e esconder o botão "Encaminhar para o Closer" nesse caso.
  - Atualizar o texto explicativo do cabeçalho para descrever a devolução.
  - Botão "Não fui eu que atendi": reaproveita `handleTransfer` (RPC `transfer_agendamento_closer`), com rótulo/legenda novos ("Quem atendeu essa reunião?") e, após sucesso, `update({ sdr_handoff_at: new Date().toISOString(), closer_returned_at: null })` para que a trava caia direto na etapa Closer do novo responsável, mais `logAudit` (`closer_actual_attendee`) e notificação para o novo closer (via `profiles.email` do closer destino, quando houver correspondência).
