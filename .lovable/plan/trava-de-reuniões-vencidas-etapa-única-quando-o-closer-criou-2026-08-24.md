# Trava de reuniões vencidas: etapa única quando o closer criou a agenda

## O que a verificação mostrou

- A etapa 1 (SDR) é definida por `created_by` — quem clicou em criar a agenda.
- Nos últimos 30 dias há 16 agendas ativas criadas por usuários com função closer, 7 delas em que o criador é o próprio closer da reunião (Talita, Lucas Santos, Roni, Pedro Ferro, Hellen, Cibele).
- Nesses casos a trava aparece para o closer já na etapa 1, com os botões de SDR (Cancelar / No-show / Reagendar / Encaminhar para o Closer) e sem o botão "Realizada". É exatamente o que os closers estão relatando.
- Reuniões criadas por gestor/supervisor não travam ninguém na etapa 1 (perfis de gestão são isentos), então o closer só as vê se alguém encaminhar.

## Como vai ficar

Quando a pessoa travada é, ao mesmo tempo, o criador da agenda e o closer da reunião, a trava passa a ser **etapa única**: todos os botões aparecem juntos.

- Cancelar
- No-show
- Reagendar (mesmo dia troca horário; outro dia cria nova agenda)
- Realizada
- Transferir para outro closer

Nesse caso o botão "Encaminhar para o Closer" não faz sentido e não é exibido (encaminhar para si mesmo).

Os demais casos continuam exatamente como hoje:
- SDR criador ≠ closer: etapa 1 SDR (Cancelar / No-show / Reagendar / Encaminhar), depois etapa 2 Closer (Realizada / Transferir).
- Closer que criou agenda para OUTRO closer: continua na etapa SDR, com a opção de encaminhar.

Visualmente o cartão passa a mostrar o selo "Etapa: SDR + Closer" quando estiver no modo combinado, para ficar claro que a pessoa resolve tudo ali.

## Detalhes técnicos

- `src/hooks/useOverdueMeetings.ts`: o tipo `stage` passa a aceitar `"both"`. No cálculo atual (`sdr_handoff_at ? "closer" : "sdr"`), antes do filtro, marcar `stage = "both"` quando `created_by === user.id` **e** `closer_id === myCloserId` e `sdr_handoff_at` for nulo. O filtro de visibilidade aceita `both` pelas duas condições (já satisfeitas por definição).
- `src/components/OverdueMeetingsLockOverlay.tsx`: os blocos de ação passam a renderizar por capacidade em vez de igualdade estrita — ações de SDR quando `stage === "sdr" || stage === "both"`, ações de Closer quando `stage === "closer" || stage === "both"`. O botão "Encaminhar para o Closer" fica condicionado a `stage === "sdr"`. Badge de etapa e o texto explicativo do cabeçalho ajustados para cobrir o caso combinado.
- Nenhuma mudança de banco, de RLS ou do fluxo de handoff (`sdr_handoff_at` continua igual).
