# Correção: reatribuir closer sem mexer no Google Calendar

Você está certo. A ação acontece **depois** da reunião: recriar evento/Meet link na agenda do novo closer não serve para nada. O objetivo real é apenas **transferir a responsabilidade de registro** para o closer que efetivamente atendeu o lead, para que ele possa preencher "Realizada" / Resultado da Reunião.

## O que muda na trava de tela

- Botão renomeado de "Enviar para novo closer" para **"Definir closer que atendeu"**.
- Continua exclusivo de **Gestor, Supervisor e Moderador de SDR**.
- Ao confirmar:
  - o agendamento passa a apontar para o closer escolhido;
  - a reunião entra na etapa do closer (ele vê a trava e pode registrar o resultado);
  - a marca de "devolvida pelo closer" é limpa;
  - **nenhuma** chamada ao Google: o `meet_link` e o `google_event_id` originais são preservados como histórico;
  - fica registrado em auditoria quem transferiu, de qual closer para qual;
  - o novo closer recebe uma notificação para registrar a reunião.
- Textos ajustados: o aviso "o evento será recriado na agenda dele" sai e passa a explicar que é apenas para registro do resultado.
- O aviso de reunião devolvida passa a orientar: peça a um gestor/supervisor para definir o closer que atendeu.

## Detalhes técnicos

- Remover a chamada a `google-transfer-event` de `handleTransferToNewCloser` em `src/components/OverdueMeetingsLockOverlay.tsx`.
- Nova função de banco `reassign_agendamento_closer_for_result(_agendamento_id uuid, _new_closer_id uuid)` (SECURITY DEFINER, `search_path = public`), autorizada para gestor, supervisor e moderador com `moderador_tipo = 'sdr'`. Ela atualiza somente `closer_id`, `sdr_handoff_at = now()`, `closer_handoff_at = now()`, `closer_returned_at = NULL`, `closer_return_reason = NULL` — sem tocar em `meet_link`/`google_event_id`. Grant de EXECUTE apenas para `authenticated`.
  - A `transfer_agendamento_closer` existente continua intacta (ela zera o Meet link e é usada nas transferências pré-reunião do Calendário e da Lista de Reuniões).
- Inserir notificação (`type: "meeting_reassigned_for_result"`) para o usuário do novo closer, quando houver perfil vinculado.
- Auditoria: `logAudit("reassign_closer_for_result", ...)` com lead, data/hora, closer de origem e destino.
- Invalidar os caches do dia/trava após a operação (`invalidateAll`), como já é feito hoje.
