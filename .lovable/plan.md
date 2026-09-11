# Prompt para replicar a aba "Gravação" (Administração)

Abaixo está o texto pronto para colar no outro projeto Lovable. Ele descreve 100% da aba, incluindo o que ela lê do banco e as dependências que precisam existir para os números fazerem sentido.

---

## PROMPT (copie daqui para baixo)

Preciso replicar integralmente a aba **"Gravação"** da página **Administração** de outro painel de agendamentos. Implemente exatamente o descrito abaixo, sem simplificar.

### 1. Pré-requisitos de banco (crie se não existirem)

- `closers.auto_recording_enabled boolean not null default false`
- `closer_google_tokens.granted_scopes text` (string de escopos separados por espaço, salva no callback OAuth do Google)
- Tabela de auditoria `audit_logs` com colunas `action text`, `entity_type`, `entity_id`, `details jsonb`, `created_at timestamptz default now()`
- Grants + RLS: gestores/moderadores podem ler `closers`, `closer_google_tokens` e `audit_logs`, e atualizar `closers.auto_recording_enabled`. Nunca deixar tabela nova sem GRANT para `authenticated` e `service_role`.

Escopo usado como referência em todo o código:
`https://www.googleapis.com/auth/meetings.space.created`

### 2. Nova aba na Administração

Na página Administração (visível **somente para gestor**), adicione uma aba `gravacao` com ícone de vídeo, rótulo **"Gravação"**, renderizando um componente `MeetRolloutPanel`.

### 3. Componente `MeetRolloutPanel` — dados

Uma única query (React Query, chave `meet-rollout-status`) que faz 3 leituras em paralelo:

1. `closers`: `id, name, active, auto_recording_enabled` onde `active = true`, ordenado por nome.
2. `closer_google_tokens`: `closer_id, granted_scopes` (mapa closer → tem/não tem o escopo do Meet).
3. `audit_logs`: registros com `action = 'meet_auto_recording'` dos **últimos 14 dias**; agrupar por `details.closer_id` contando `details.mode === 'auto'` vs qualquer outro valor (fallback).

Cada linha do painel resulta em: `id, name, autoEnabled, connected, hasMeetScope, autoCount, fallbackCount`.

### 4. Componente `MeetRolloutPanel` — interface

**Cartão único** com título "Rollout da gravação automática do Meet" e ícone de vídeo. Enquanto carrega, mostrar 3 skeletons.

**Faixa de 5 indicadores** (grid 2 colunas no mobile, 5 no desktop):
- Closers ativos (total de linhas)
- Com flag ligada
- Com permissão OK (têm o escopo)
- Aguardando reconexão (flag ligada mas sem o escopo)
- Reuniões auto / fallback (14d) — exibido como `X / Y`

**Barra de ações em lote** (habilitada só com seleção):
- "Ativar para selecionados (N)" — botão primário, spinner enquanto salva
- "Desativar selecionados" — botão outline
- "Selecionar prontos e ainda desligados" — seleciona quem tem o escopo e está com a flag off
- "Limpar seleção" — só aparece com seleção ativa

Ação em lote: `update closers set auto_recording_enabled = <bool> where id in (...)`, depois registrar auditoria com ação `meet_auto_recording_bulk_enable` / `meet_auto_recording_bulk_disable` (entidade `closer`, details com `closer_ids`, nomes e total), toast de sucesso/erro, limpar seleção e invalidar `meet-rollout-status` e a query de usuários da Administração.

**Texto explicativo** abaixo das ações: recomendar liberar em ondas (ex.: 5 closers por dia), acompanhar a coluna auto/fallback antes da onda seguinte, e avisar que closers sem a permissão seguem no fluxo atual e verão um aviso para reautorizar o Google.

**Lista por closer** (uma linha cada, fundo suave, cantos arredondados):
- Checkbox de seleção com `aria-label` "Selecionar {nome}"
- Nome (truncado) e, abaixo, o status com ícone e cor semântica:
  - sem token → "Google não conectado" (ícone X, cor de erro)
  - com token e sem o escopo → "Conectado — falta permissão de gravação" (alerta, amarelo)
  - com o escopo → "Pronto para gravação automática" (check, cor primária)
- À direita: `auto N / fallback M` em texto pequeno e um selo arredondado "gravação ativa" (cor primária) ou "desligada" (cor neutra), conforme a flag
- Estado vazio: "Nenhum closer ativo encontrado."

Use apenas tokens semânticos de cor do design system (sem `text-white`, sem hex fixo), componentes shadcn (Button, Checkbox, Skeleton) e ícones lucide (`Video`, `VideoOff`, `CheckCircle2`, `AlertTriangle`, `XCircle`, `Loader2`). Todos os textos em português do Brasil.

### 5. Dependências para os números serem reais

Para "auto / fallback" preencher, a função que cria o evento do Google precisa:
- Ler a flag do closer e os `granted_scopes` do token;
- Se flag ligada **e** escopo presente: criar o espaço via **Google Meet API v2** (`POST https://meet.googleapis.com/v2/spaces`) com `config.artifactConfig.recordingConfig.autoRecordingGeneration = 'ON'` e `transcriptionConfig.autoTranscriptionGeneration = 'ON'`, com retentativa só com gravação caso a transcrição seja recusada, e usar o `meetingUri` retornado no evento;
- Em qualquer falha, cair no fluxo atual do Calendar (fallback) — o agendamento nunca deve falhar;
- Gravar em `audit_logs` a ação `meet_auto_recording` com `details.closer_id` e `details.mode` = `auto` ou `fallback`.

Também: incluir o escopo `meetings.space.created` na URL de autorização do Google, salvar `granted_scopes` no callback, e no banner do closer mostrar "Reautorize o Google para ativar a gravação automática" quando a flag estiver ligada e o escopo faltar.

### 6. Validação

- Typecheck e build sem erros.
- Abrir Administração → Gravação como gestor: indicadores coerentes, seleção em lote funcionando, status por closer correto (conectado com/sem permissão e desconectado).
- Ativar para 1 closer, conferir que a flag persistiu e que a auditoria em lote foi registrada.

---
