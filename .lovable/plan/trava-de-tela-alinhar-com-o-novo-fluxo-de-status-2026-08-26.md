# Trava de tela: alinhar com o novo fluxo de status

## O que a verificação mostrou

- A trava continua aparecendo **primeiro para o SDR** (responsável ou criador) e só passa para o Closer depois do encaminhamento (`sdr_handoff_at`). Isso não quebrou com as mudanças de status.
- A trava só considera reuniões ativas (`agendada`, `confirmada`, `nao_confirmada`), então o fim do "Reagendado" não deixou reuniões presas.
- O botão "Não compareceu" da trava abre o mesmo diálogo de motivo (`NaoCompareceuDialog`) usado em Detalhes da Reunião, mas o comportamento **não é idêntico**: na trava o pop-up de novo agendamento aparece, porém falta o refetch do dia e o patch do cache que a tela de detalhes faz, e a trava não exige motivo pela mesma função de status (é um update próprio). Resultado: a linha pode continuar visível/desatualizada por alguns instantes.
- O texto do cabeçalho ainda fala em "Cancelar, No-show ou Reagendar" — vocabulário antigo (aparece no print).
- O botão "Encaminhar para o Closer" está oculto quando a reunião foi devolvida pelo closer (`closer_returned_at`). Foi exatamente o caso do print: sobrou só "Não compareceu", sem saída para reenviar a reunião.
- Não existe hoje, na trava, nenhuma ação de "enviar para outro closer". A transferência existe apenas em Detalhes da Reunião, e a função de transferência hoje autoriza gestor, supervisor, moderador de SDR e o closer dono — **o SDR não é autorizado**, então essa ação precisa liberar também o SDR responsável/criador da reunião.

## Como vai ficar

Na trava, para o SDR, três ações na ordem:

1. **Não compareceu** — idêntica à de Detalhes da Reunião: escolhe o motivo na lista, grava `no_show` + motivo, e em seguida abre o pop-up de novo agendamento com os dados do lead pré-preenchidos.
2. **Enviar para o closer** — encaminha a responsabilidade para o closer vinculado. Não aparece se a reunião já foi devolvida pelo closer original; nesse caso só é possível marcar "Não compareceu" ou, para gestores/supervisores/moderadores de SDR, enviar para um novo closer.
3. **Enviar para novo closer** — ação exclusiva e autorizada apenas para gestor, supervisor e moderador de SDR. Abre a lista de closers ativos; ao confirmar, a reunião muda de closer, o evento/link do Meet é recriado na agenda do novo closer e a responsabilidade é encaminhada para ele no mesmo passo. Uso previsto: o closer original ficou preso em outra call e outro closer entrou na reunião.

A etapa do Closer (Realizada / "Não fui eu que atendi") continua como está. No caso em que o criador é o próprio closer da reunião, as ações de SDR e de Closer continuam juntas na mesma etapa.

O texto de cabeçalho passa a descrever o fluxo novo: SDR resolve com "Não compareceu" ou envia para o closer; gestores/supervisores/moderadores de SDR também podem enviar para um novo closer.

## Detalhes técnicos

- `src/components/OverdueMeetingsLockOverlay.tsx`
  - "Não compareceu": manter `NaoCompareceuDialog`, e depois do update acrescentar o mesmo pós-processamento da tela de detalhes — `refetchQueries(["agendamentos", m.scheduled_date])` além das invalidações atuais.
  - "Enviar para o closer": manter a condição atual (`m.closer_id && m.stage === "sdr" && !m.closer_returned_at`), ou seja, o botão some quando a reunião foi devolvida pelo closer.
  - Novo bloco "Enviar para novo closer": visível apenas quando o usuário tem papel de gestor, supervisor ou moderador de SDR. Usa `Select` com closers ativos (`closers` where `active`, ordenado por nome, query habilitada só ao abrir), botão de confirmação chamando `supabase.functions.invoke("google-transfer-event", { agendamento_id, new_closer_id })`; em caso de sucesso, gravar `sdr_handoff_at = now()` e limpar `closer_returned_at`, registrar `logAudit("transfer_lead", ...)` com origem "trava" e invalidar as queries.
  - Limpar o estado morto de reagendamento (`rescheduleFor`, `newDate`, `newTime`, `TIME_OPTIONS`, `handleReschedule`) e atualizar o texto do cabeçalho.
- Sem mudanças na função `google-transfer-event` (permissões atuais já cobrem gestor, supervisor, moderador de SDR e closer dono).
- Sem mudanças de schema, RLS ou de payload para o CRM (a transferência já usa o fluxo existente).
