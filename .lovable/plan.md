# Restaurar "Grupo Silva & [Nome do lead]" nas reuniões do Meet

## O que mudou

No fluxo antigo o Meet era criado pelo próprio Google Calendar (`conferenceData.createRequest`), então a sala ficava **vinculada ao evento** e herdava o título do evento ("Grupo Silva & [Nome do lead]").

No fluxo de gravação automática a sala passa a ser criada antes, pela Meet API (`spaces.create`), e o link é apenas colado no campo *Local* do evento. Uma sala criada assim é avulsa: não tem vínculo com o evento, então o Meet a exibe com nome genérico/código e o link não aparece como "Entrar com o Google Meet" no evento.

## Correção proposta

Continuar criando a sala com gravação/transcrição automáticas, mas **anexá-la ao evento como conferência de verdade** em vez de usar o campo Local:

```text
1) Meet API spaces.create  -> meetingUri + meetingCode (gravação auto ON)
2) Calendar events.insert  -> summary: "Grupo Silva & [Nome do lead]"
                              conferenceData:
                                conferenceId: <meetingCode>
                                conferenceSolution: hangoutsMeet
                                entryPoints: [{ video, uri: meetingUri }]
                              (conferenceDataVersion=1)
```

Com isso o evento volta a mostrar o botão do Meet, e a sala aparece atrelada ao evento — recuperando o nome com o lead para os SDRs.

## Detalhes técnicos

- Arquivo: `supabase/functions/google-create-event/index.ts`.
- `createAutoRecordingSpace` passa a devolver também `meetingCode` (já vem na resposta do `spaces.create`).
- Substituir `event.location = autoSpace.uri` por o bloco `conferenceData` acima; manter `conferenceDataVersion=1` na URL (já está).
- Manter a linha do link na descrição como reforço, e manter o `meet_link` salvo em `agendamentos.meet_link` a partir de `autoSpace.uri`.
- Fallback inalterado: se a Meet API falhar, o Calendar cria o Meet como antes.
- Se o Calendar recusar o `conferenceData` importado, cair para o comportamento atual (link em Local) em vez de falhar o agendamento.

## Validação

- Criar um agendamento de teste para um closer com gravação automática ligada.
- Conferir no Calendar: título "Grupo Silva & [Nome do lead]" e botão do Meet no evento.
- Entrar na sala e confirmar: nome da reunião com o lead **e** gravação/transcrição iniciando sozinhas.
- Conferir que reuniões antigas/fallback continuam normais.
