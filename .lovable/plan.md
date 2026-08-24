# Plano: Garantir que toda reunião seja gravada (lembrete forçado no painel)

## Como funciona a abordagem escolhida

A ideia é usar o próprio painel para tornar impossível o closer "esquecer" de gravar. Em vez de depender da memória, o sistema cobra a gravação em três momentos:

1. **Antes de entrar na call** — no momento de abrir o link do Meet.
2. **Durante a janela da reunião** — aviso persistente no painel do closer.
3. **No fechamento do resultado** — o closer só consegue registrar o resultado da reunião depois de declarar que gravou (ou justificar por que não gravou).

O sistema não liga a gravação sozinho (isso o Google não permite via API no Business Standard), mas cria uma barreira operacional e um registro auditável de quem gravou e quem não gravou.

## O que será implementado

### 1. Confirmação ao entrar na reunião
- Ao clicar no link do Meet (nos detalhes do agendamento, no calendário e no travamento de reunião atrasada), abre um passo intermediário curto:
  - Instrução visual: "Ao entrar, clique em Atividades > Gravação > Iniciar gravação e ativar transcrição."
  - Botão "Entendi, entrar na reunião" — só então o Meet abre em nova aba.
- Fica registrado o horário em que o closer viu o aviso.

### 2. Aviso persistente durante a reunião
- Enquanto houver reunião do closer em andamento (do horário de início até o fim previsto), aparece uma faixa fixa no topo do painel:
  - "Reunião em andamento com {lead} — a gravação está ativa?" com botão "Sim, estou gravando".
- Ao confirmar, a faixa some para aquela reunião. Sem confirmar, a faixa permanece.

### 3. Bloqueio no registro do resultado da reunião
- No modal "Resultado da Reunião" (usado pelo closer, inclusive no travamento pós-horário), adicionar campo obrigatório:
  - "A reunião foi gravada?" → **Sim** / **Não**
  - Se **Não**: exigir justificativa em texto (mínimo de caracteres, como já é feito na justificativa de não-venda).
- Sem responder, o botão de salvar continua desabilitado — mesmo comportamento das outras validações do modal.

### 4. Registro e visibilidade para gestão
- Guardar na reunião: se foi gravada, quem confirmou e quando, e a justificativa quando não gravada.
- Registrar no log de auditoria.
- Na Lista de Reuniões: coluna/badge indicando "Gravada" ou "Sem gravação", e filtro "Apenas sem gravação".
- Notificação para gestores/moderadores/supervisores quando um closer registra reunião sem gravação.

### 5. Indicador de aderência
- No painel de gestão, um card simples: percentual de reuniões realizadas com gravação confirmada no período, e ranking por closer.

## Detalhes técnicos

- Banco: novas colunas em `agendamentos` — `recording_confirmed_at` (timestamp), `recording_confirmed_by` (uuid), `recording_missing_reason` (text). Colunas nulas por padrão, sem impacto em dados existentes.
- Frontend:
  - Novo componente de diálogo de confirmação antes de abrir o `meet_link`, aplicado nos pontos que hoje abrem o link (detalhes do agendamento no Dashboard/Calendário e `OverdueMeetingsLockOverlay.tsx`).
  - Nova faixa de reunião em andamento, no mesmo padrão do `OverdueFollowUpsBanner.tsx`.
  - Campo obrigatório de gravação em `VendaDialog.tsx`, seguindo a validação já existente de `canSubmit`.
  - Coluna, badge e filtro em `ReunioesListPage.tsx`.
- Notificação de reunião sem gravação via trigger na tabela `agendamentos`, no mesmo padrão dos avisos existentes para gestores.

## Limitação a registrar

No Google Workspace Business Standard, ativar gravação e transcrição automaticamente exige a API do Google Meet (v2beta) com novo consentimento OAuth de cada closer, e a transcrição automática depende do tier. Se em algum momento quiser o caminho nativo, ele pode ser adicionado depois em cima dessa mesma base — o controle de aderência continua útil nos dois cenários.
