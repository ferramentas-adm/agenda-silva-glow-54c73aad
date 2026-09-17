# Não comparecimento: motivo na pizza, descrição na justificativa

## Por que aparecem "outros motivos"
A lista da tela é fixa (No-show, Cancelou por desistência, Cancelou por imprevisto pessoal, Não acompanhado pelo SDR, Sem closer disponível, Alterou horário para o mesmo dia — editável em Admin > Listas), mas o mesmo campo do motivo é preenchido com **texto livre** por outros caminhos:

- As rotas de **cancelar** e **reagendar** usadas pelas automações/SDR IA gravam no motivo o texto que recebem ("remarcar", "solicitou reagendamento", "atribuir closer (estava pendente na fila)", "turma B: lead nao qualificado…").
- Na tela de **novo agendamento**, ao encerrar a reunião anterior do mesmo lead, é usada **outra lista** (Imprevisto do lead, Sem motivo explícito, Desistiu, Outros) e, sem escolha, o texto automático "Lead reagendou para outro dia".
- Registros antigos, de antes da lista atual.

Resultado: 2.457 registros sem motivo, ~2.000 com motivo da lista e centenas de variações livres — cada uma virando uma fatia na pizza.

## O que fazer

### 1. Separar motivo de justificativa
- Novo campo de **justificativa** na reunião (não mexe em nada existente).
- Motivo passa a aceitar **somente** valores da lista oficial; qualquer descrição livre vai para a justificativa.
- Rotas de cancelar/reagendar: o texto recebido é gravado na justificativa; o motivo é preenchido quando o texto casa com um item da lista, senão fica como **"Outros"** (novo item da lista).
- Tela de novo agendamento passa a usar a **mesma lista oficial** ao encerrar a reunião anterior; o texto livre vai para a justificativa.
- Histórico: sem alterar dados, quando não houver justificativa própria a tela mostra o texto antigo do motivo como justificativa.

### 2. Pizza por motivo (como no print)
- Fatias apenas dos motivos da lista + "Outros" + "Sem motivo informado". Nada de texto livre virando fatia.
- Total da pizza continua igual ao card "Total não comparecimento".
- Ao clicar na fatia, a lista detalhada mostra lead, data, SDR e a **justificativa** de cada registro.
- Legenda lateral acompanha os mesmos agrupamentos.

### 3. CSVs
- CSV "nunca compareceram" ganha as duas informações: coluna **Motivo** (da lista) e coluna **Justificativa** (texto).

## O que não muda
- Cards de resumo (Total / Cancelado / No-show / Não contabilizado) e a regra que decide em qual quadro cada reunião entra.
- Formato de respostas das rotas (só ganham campo novo), lembretes, integrações e demais abas.

## Detalhes técnicos
- Migração: `alter table agendamentos add column cancellation_note text` + grants/RLS já existentes na tabela.
- Escrita: `silva-cancelar`, `silva-reagendar`, `src/services/reagendamento.ts`, `OverdueMeetingsLockOverlay`, `PendingMeetingsBanner`, `DashboardPage` (patch de status).
- Normalização do motivo (trim, sem acento, case-insensitive) em `src/lib/noShowReasons.ts`, consumida pela pizza em `NaoComparecimentoTab.tsx`.
- "Outros" acrescentado a `DEFAULT_NO_SHOW_REASONS`.

## Validação
- Build OK pelo log de observabilidade.
- Conferir no preview que a pizza mostra só os motivos da lista e que a justificativa aparece no detalhe.
