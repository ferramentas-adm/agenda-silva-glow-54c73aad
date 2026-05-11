## Contexto

Hoje, no painel de agendamento:

- **Editar horário** (botão no detalhe do agendamento) só altera o horário **no mesmo dia** — moderador e gestor já têm essa permissão.
- **Transferir lead para outro closer** já existe e funciona para moderador e gestor.
- **Mudar a DATA** (reagendar para outro dia) só é possível abrindo `/agendar?edit=<id>`, mas **não há botão na UI** que dispare esse fluxo (o antigo "Reagendar" foi removido para evitar duplicidade no DataCrazy).
- **Agendar em nome de qualquer closer pelo `/agendar`** já funciona para gestor/moderador (o `CloserSelector` lista todos os closers ativos).

Falta apenas devolver à interface uma forma controlada de **reagendar (mudar de dia)** para moderador e gestor, reaproveitando o fluxo `/agendar?edit=` que já trata corretamente:
- marca o original como `reagendada`,
- cria novo registro com `original_agendamento_id` apontando para o original,
- envia ao DataCrazy o status correto (sem duplicar).

## Mudanças

### 1. Botão "Reagendar (outro dia)" no detalhe do agendamento
Arquivo: `src/pages/DashboardPage.tsx`

- Adicionar, abaixo de "Editar horário", um botão **"Reagendar para outro dia"** visível apenas quando `role === 'gestor' || role === 'moderador'`.
- Ao clicar: navegar para `/agendar?edit=<detailAg.id>&lead_name=<encoded>&lead_phone=<encoded>` (mesmo padrão de URL já consumido pelo AgendarPage).
- Não duplicar para closers/SDRs — eles continuam com seu fluxo atual (closer reagenda pelo próprio botão "Justificar reagendamento", SDR não reagenda).

### 2. Garantir que `AgendarPage` em modo edit funciona para moderador/admin
Arquivo: `src/pages/AgendarPage.tsx`

- Verificação rápida: confirmar que o fluxo de edit (que já existe) preserva `closer_id` selecionável (qualquer closer) e respeita as RLS atuais (moderador/gestor já têm UPDATE em `agendamentos`).
- Sem mudanças funcionais previstas — só validação.

### 3. Permissão (matriz)
- A nova ação reutiliza a permissão existente `edit_appointment_time` apenas como gate visual? **Não.** Como o reagendamento de dia é uma ação distinta e mais ampla, vou limitar a visibilidade do botão **diretamente por role** (`gestor`/`moderador`), sem nova chave na matriz, para manter o escopo enxuto. Se quiser controle fino na matriz futuramente, adicionamos depois.

### 4. Auditoria
- O fluxo de `/agendar?edit=` já registra log de reagendamento (insere novo registro + atualiza original). Sem mudança extra.

## Não está no escopo

- Mudar comportamento de "Editar horário" (continua mesmo-dia).
- Alterar o fluxo do closer (justificativa de reagendamento).
- Criar nova permissão na matriz.

## Resultado esperado

Moderador e gestor abrem o detalhe de qualquer agendamento e veem três ações principais:
1. **Editar horário** (mesmo dia)
2. **Reagendar para outro dia** (novo botão → abre `/agendar?edit=`)
3. **Transferir lead para outro closer** (já existente)
