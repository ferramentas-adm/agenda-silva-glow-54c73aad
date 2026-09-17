# Não comparecimento: motivo na pizza, descrição na justificativa

## Por que aparecem "outros motivos"
A lista da tela é fixa (No-show, Cancelou por desistência, Cancelou por imprevisto pessoal, Não acompanhado pelo SDR, Sem closer disponível, Alterou horário para o mesmo dia — editável em Admin > Listas), mas o mesmo campo do motivo recebe **texto livre** por outros caminhos:

- Rotas de **cancelar** e **reagendar** usadas pela IA SDR / automações gravam no motivo o texto recebido ("remarcar", "solicitou reagendamento", "atribuir closer (estava pendente na fila)", "turma B: lead nao qualificado…").
- Na tela **Agendar** (menu lateral, `/agendar`), ao encerrar a reunião anterior do mesmo lead, é usada **outra lista** (Imprevisto do lead, Sem motivo explícito, Desistiu, Outros) e, sem escolha, o texto automático "Lead reagendou para outro dia".
- Registros antigos, de antes da lista atual.

Hoje: 2.457 registros sem motivo, ~2.000 com motivo da lista e centenas de variações livres — cada uma virando uma fatia na pizza.

## O que fazer

### 1. Separar motivo de justificativa
- Novo campo de **justificativa** na reunião (campo novo, não mexe em nada existente).
- Motivo passa a aceitar **somente** valores da lista oficial; toda descrição livre vai para a justificativa.
- Tela **Agendar** passa a usar a mesma lista oficial ao encerrar a reunião anterior, com campo de justificativa livre ao lado.
- Histórico: sem alterar dados, quando não houver justificativa própria a tela exibe o texto antigo do motivo como justificativa.

### 2. Caminho da IA SDR ("Não compareceu")
- A rota de cancelamento com antecedência passa a seguir o mesmo fluxo da tela: **motivo obrigatório da lista oficial** + **justificativa obrigatória** em texto livre para enriquecimento.
- Motivo fora da lista é recusado com erro claro (`motivo_invalido`) devolvendo a lista de motivos válidos, para a IA escolher o mais próximo da realidade do lead.
- Rota de reagendamento segue a mesma regra ao encerrar a reunião anterior.
- Os textos técnicos internos (ex. "atribuir closer (estava pendente na fila)") deixam de ir para o motivo e passam a ir só para a justificativa.

### 3. Pizza por motivo (como no print)
- Fatias apenas dos motivos da lista + "Sem motivo informado". Nada de texto livre virando fatia.
- Total da pizza continua igual ao card "Total não comparecimento".
- Ao clicar na fatia, a lista detalhada mostra lead, data, SDR e a **justificativa** de cada registro.
- Legenda lateral acompanha os mesmos agrupamentos.

### 4. CSV
- CSV "nunca compareceram" ganha duas colunas: **Motivo** (da lista) e **Justificativa** (texto).

## O que não muda
- Cards de resumo (Total / Cancelado / No-show / Não contabilizado) e a regra que decide em qual quadro cada reunião entra.
- Formato de identificadores das rotas (só ganham campo novo), lembretes, integrações e demais abas.

## Detalhes técnicos
- Migração: `alter table agendamentos add column cancellation_note text` (grants/RLS da tabela já cobrem).
- Escrita: `silva-cancelar`, `silva-reagendar`, `silva-atribuir-closer`, `src/services/reagendamento.ts`, `OverdueMeetingsLockOverlay`, `PendingMeetingsBanner`, `DashboardPage`, `NaoCompareceuDialog` (campo justificativa).
- Validação do motivo nas rotas contra a lista de `app_settings.no_show_reasons` (fallback `DEFAULT_NO_SHOW_REASONS`).
- Normalização (trim, sem acento, case-insensitive) em `src/lib/noShowReasons.ts`, consumida pela pizza em `NaoComparecimentoTab.tsx`.

## Validação
- Build OK pelo log de observabilidade.
- Teste real das rotas de cancelar/reagendar com motivo válido, motivo inválido e sem justificativa.
- Conferir no preview que a pizza mostra só os motivos da lista e que a justificativa aparece no detalhe.
