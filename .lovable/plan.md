# Prompt para replicar: gravação e transcrição automáticas do Google Meet

Copie o texto abaixo e cole no outro projeto.

---

Implemente gravação e transcrição automáticas nas reuniões do Google Meet criadas pelo painel de agendamentos, com rollout controlado por closer e fallback total para o fluxo atual. Não quebre nada que já funciona: tudo é aditivo.

## Contexto do que já existe (confirme antes de mexer)
Este projeto já cria o evento no Google Calendar por uma edge function (equivalente a `google-create-event`) usando `conferenceData.createRequest` para gerar o Meet, com tokens por closer numa tabela tipo `closer_google_tokens` e OAuth em `google-auth-url` / `google-callback`. Leia esses arquivos e a tabela de closers antes de aplicar qualquer mudança e adapte nomes reais de colunas — não invente campos.

## 1. Banco (migration aditiva)
- `closers.auto_recording_enabled boolean NOT NULL DEFAULT false` — flag de piloto por closer.
- `closer_google_tokens.granted_scopes text NULL` — escopos que o Google devolveu no consentimento.
- Nenhuma outra alteração estrutural; nada de novas tabelas. Mantenha as policies existentes (o gestor já precisa poder atualizar `closers` e deletar tokens).

## 2. OAuth: escopo do Meet
Na função que monta a URL de autorização, adicione o escopo:
`https://www.googleapis.com/auth/meetings.space.created`
junto de `https://www.googleapis.com/auth/calendar`, mantendo `access_type=offline` e `prompt=consent`.

No callback, ao salvar/upsertar o token, grave também `granted_scopes: tokenData.scope` (string, quando vier string). Como o escopo é novo, cada closer precisa reconectar o Google uma vez; tokens antigos continuam válidos para o fluxo atual.

## 3. Criação do evento com sala já configurada
Na edge function de criação de evento, antes de montar o payload do Calendar:

1. Leia `closers.auto_recording_enabled` do closer do agendamento.
2. Se a flag for `true` **e** `granted_scopes` contiver o escopo do Meet, crie o espaço via Meet API:
   `POST https://meet.googleapis.com/v2/spaces` (use **v2**; `v2beta` responde 404 "Method not found"), corpo:
   ```json
   {"config":{"accessType":"TRUSTED","entryPointAccess":"ALL","artifactConfig":{"recordingConfig":{"autoRecordingGeneration":"ON"},"transcriptionConfig":{"autoTranscriptionGeneration":"ON"}}}}
   ```
   com `Authorization: Bearer <access_token do closer>` e timeout (`AbortSignal.timeout(10000)`).
3. Se o Google recusar a transcrição (depende do tier do Workspace), repita a chamada pedindo **só** `recordingConfig`. Registre no log qual das tentativas passou.
4. Com o espaço criado, use o `meetingUri` retornado: **não** envie `conferenceData.createRequest`; coloque o link em `event.location`, cite o link e o aviso de gravação na `description`, e salve esse mesmo link no campo `meet_link` do agendamento.
5. Se a flag estiver desligada, o escopo faltar, ou qualquer etapa falhar (erro, timeout, sem `meetingUri`), caia no fluxo atual do Calendar com `createRequest`. Nenhum agendamento pode deixar de ser criado por causa disso.
6. Controle o modo com uma variável `'auto' | 'fallback' | 'off'` e retorne na resposta `auto_recording` e `auto_transcription` (booleans).
7. Quando o modo não for `'off'`, grave um registro em `audit_logs` com `action = 'meet_auto_recording'` e `details = { lead_name, closer_id, mode, transcription }`, dentro de try/catch (falha de log nunca derruba a criação do evento).

## 4. Banner do closer (reautorização direcionada)
No banner de conexão do Google exibido ao closer:
- Consulte o closer pelo e-mail trazendo `auto_recording_enabled`, e o token trazendo `granted_scopes`.
- Três estados: não conectado → aviso atual "Conectar Google Calendar"; conectado **com** flag ligada mas **sem** o escopo do Meet → aviso "Reautorize o Google para ativar a gravação automática" com botão "Reautorizar Google"; conectado e com escopo → não mostra nada.
- Use `staleTime: 0`, `refetchOnMount: "always"`, `refetchOnWindowFocus: "always"` e `placeholderData: (prev) => prev` para o banner não piscar, e não trate erro de query como "desconectado" (lance o erro).
- Botão "Já conectei" que refaz a checagem, e polling de 3s (máx. ~3min) após abrir o popup de OAuth; ao confirmar, invalide a query dos eventos do calendário e mostre sucesso.

## 5. Administração (gestor)
- Ícone de status do Google por closer na lista de usuários: verde = conectado com permissão de gravação; amarelo = conectado sem a permissão; cinza = desconectado.
- Botão de desconectar a conta Google do closer, com diálogo de confirmação explicando o efeito (agenda deixa de ser lida e novos eventos não são criados até reconectar). Ação: deletar a linha de `closer_google_tokens` daquele closer, registrar auditoria `google_disconnect` e invalidar as queries de usuários/tokens. Nada além da conexão é apagado.
- Toggle por closer "Gravação automática do Meet", com confirmação avisando que o closer precisa reconectar o Google uma vez.
- Painel de rollout: lista de closers com status legível (Conectado com gravação / Conectado sem permissão / Desconectado), seleção múltipla com ativação/desativação em lote (`UPDATE closers SET auto_recording_enabled`, auditoria `meet_auto_recording_bulk_enable|disable`) e contador dos últimos 7 dias de `auto` x `fallback` lido de `audit_logs` (`action = 'meet_auto_recording'`).

## 6. Rollout recomendado
Ativar em ondas (3–5 closers, depois 10, depois o resto), pedindo a reconexão do Google e conferindo nos logs se as reuniões saíram em modo `auto`. Se algum closer cair em fallback recorrente, basta desligar a flag dele.

## 7. Validação
- Ligar a flag para 1 closer, reconectar o Google e confirmar que `granted_scopes` contém o escopo do Meet.
- Criar 1 agendamento de teste, conferir nos logs da função que veio `mode: auto` (e não fallback), e ler o espaço criado na Meet API confirmando os dois flags ativos.
- Entrar na sala e confirmar que gravação/transcrição iniciam sozinhas; os arquivos vão para o Drive do closer.
- Criar um agendamento para um closer sem a flag e confirmar que nada mudou no fluxo dele.
- Sem alterações no fuso: todo cálculo de horário continua em `America/Sao_Paulo` (-03:00).

Observação de plano: no Business Standard a gravação automática é o recurso principal; a transcrição automática pode ser recusada. A implementação pede as duas e mantém só a gravação quando o Google recusar a transcrição — isso aparece nos logs.
