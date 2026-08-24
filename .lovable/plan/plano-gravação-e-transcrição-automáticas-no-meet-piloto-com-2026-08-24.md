# Plano: Gravação e transcrição automáticas no Meet (piloto com 1 closer)

## Objetivo
Ao criar o agendamento, gerar a reunião do Meet já configurada para **iniciar gravação e transcrição automaticamente**, sem depender do closer clicar em nada. Ativado inicialmente para **um único closer de teste**, com fallback total para o fluxo atual caso algo falhe.

## Como funciona tecnicamente

Hoje o `google-create-event` cria o Meet junto do evento, pela API do Google Calendar (`conferenceData.createRequest`). O Calendar **não** tem campo para gravação automática.

O caminho novo, para o closer do piloto, passa a ser em duas etapas:

```text
1) Google Meet API v2beta -> spaces.create
   config.artifactConfig.recordingConfig.autoRecordingGeneration    = ON
   config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration = ON
   -> devolve o meetingUri (link da sala)

2) Google Calendar -> events.insert
   sem createRequest de Meet; o link da sala do passo 1 é anexado
   ao evento e gravado normalmente em agendamentos.meet_link
```

Quando o closer entra, a gravação e a transcrição começam sozinhas. Os arquivos caem no Drive do closer, como já acontece hoje quando ele grava manualmente.

## Rollout controlado (ponto central do plano)

- Nova coluna `auto_recording_enabled` (boolean, default **false**) na tabela `closers`.
- O fluxo novo só é usado quando essa flag está **true** para aquele closer. Todos os outros continuam exatamente no fluxo atual, byte por byte.
- Toggle na página Administração, na lista de closers: "Gravação automática do Meet (piloto)".
- **Fallback obrigatório**: se qualquer etapa nova falhar (escopo faltando, erro da Meet API, plano sem suporte, timeout), a função registra o erro no log e cai automaticamente no fluxo atual do Calendar, criando o Meet normal. Nenhum agendamento deixa de ser criado por causa disso.

## Consentimento OAuth

- Adicionar o escopo `https://www.googleapis.com/auth/meetings.space.created` na geração da URL de autorização.
- Como o escopo é novo, o closer do piloto precisa **reconectar o Google** uma vez (o botão de conexão do Google já existe na tela dele).
- Guardar em `closer_google_tokens` uma marca de quais escopos aquele token tem; se o token do closer não tiver o escopo do Meet, o sistema já usa o fallback sem nem tentar a chamada nova.
- Os tokens dos outros closers não são invalidados nem alterados.

## Etapas de implementação

1. **Banco**: `closers.auto_recording_enabled` (boolean, default false) e coluna de escopos concedidos em `closer_google_tokens`.
2. **`google-auth-url`**: incluir o escopo do Meet na lista.
3. **`google-callback`**: salvar os escopos retornados pelo Google no registro do token.
4. **`google-create-event`**: quando a flag do closer estiver ligada e o token tiver o escopo, criar o espaço via Meet API v2beta com gravação e transcrição automáticas e usar esse link no evento; qualquer falha → fluxo atual.
5. **Administração**: toggle por closer, com aviso de que é piloto e exige reconectar o Google.
6. **Visibilidade**: badge nos detalhes do agendamento indicando "Gravação automática ativa", para o gestor conferir se o piloto pegou.
7. **Logs**: registrar em auditoria se o agendamento foi criado no modo automático ou no fallback, para medirmos a taxa de sucesso do piloto.

## Como validaremos

- Ligar a flag para o closer de teste e pedir que ele reconecte o Google.
- Criar um agendamento de teste para ele e conferir nos logs se veio no modo automático.
- Entrar na sala e confirmar que gravação e transcrição iniciam sozinhas.
- Criar um agendamento para outro closer e confirmar que nada mudou no fluxo dele.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Meet API recusar a configuração no Business Standard | Fallback automático; identificamos pelo log e avaliamos upgrade só se necessário |
| Closer não reconectar o Google | Sistema detecta escopo ausente e usa o fluxo atual |
| Erro inesperado na criação da sala | Fallback cria o Meet como hoje; agendamento nunca falha |
| Impacto nos outros closers | Nenhum caminho de código novo é executado com a flag desligada |

## Observação sobre transcrição

No Business Standard a gravação automática é o recurso principal; a transcrição automática pode não estar habilitada em todos os casos. A implementação pede as duas, e se o Google recusar apenas a transcrição, mantemos a gravação — isso ficará visível nos logs do piloto.
