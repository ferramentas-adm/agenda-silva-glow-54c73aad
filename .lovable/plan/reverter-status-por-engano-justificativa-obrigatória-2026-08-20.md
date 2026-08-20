# Reverter status por engano + justificativa obrigatória

## 1. Respondendo a dúvida do clique direto

Quando um gestor/moderador/supervisor/apresentador clica em **Realizada**, o status é gravado direto, sem abrir a janela "Resultado da Reunião". Isso é intencional e vale **apenas** para esses papéis — foi definido para o gestor não precisar preencher no lugar do closer. Para **closer e SDR** o comportamento continua o mesmo: ao clicar em Realizada, o modal "Vendeu?" abre obrigatoriamente e o status só muda depois de preenchido.

## 2. Reverter status (novo)

No detalhe da agenda do calendário, para gestor/moderador/supervisor/apresentador, aparece uma ação **"Reverter status"** quando existe um status anterior registrado no histórico:

- Mostra para qual status vai voltar (ex.: "Reverter para Confirmada").
- Pede confirmação com o motivo da reversão (texto curto obrigatório), que fica na auditoria.
- Ao confirmar: o status volta ao anterior e a **declaração do closer é limpa** (Vendeu?, motivo de não fechamento e justificativa), para que a reunião volte ao fluxo normal — quando o closer/SDR marcar Realizada de novo, o modal "Vendeu? = Não → motivo + justificativa" aparece novamente.
- Venda oficial lançada pelo gestor (produto/valor/origem) **não** é apagada pela reversão.

## 3. Campo Justificativa no modal do closer

No modal "Resultado da Reunião":

- "Observações" passa a se chamar **Justificativa**.
- Quando **Vendeu = Não**: obrigatório, mínimo de **100 caracteres**, com contador ao vivo (ex.: "62/100") e o botão Confirmar bloqueado até atingir o mínimo.
- Quando **Vendeu = Sim**: continua opcional.
- Texto de apoio abaixo do campo: se possível, destacar entre aspas uma frase dita pelo cliente que explique por que ele não seguiu para o fechamento.

## Detalhes técnicos

- `src/components/VendaDialog.tsx`: renomear label para "Justificativa"; validação em `canSubmit` — `vendeuCloser === "nao"` exige `observacoes.trim().length >= 100`; contador de caracteres e helper text. Continua gravando na coluna `vendas.observacoes` (sem migração).
- Reversão em `src/pages/DashboardPage.tsx` (dialog de detalhe da agenda): busca o último registro de `audit_logs` com `action = 'update_status'` e `entity_id = agendamento.id` (o trigger `log_agendamento_change` grava `details.old_status`/`new_status`) para descobrir o status anterior. Se não houver registro, a ação não é exibida.
- Ao confirmar: `update agendamentos set status = <old_status>`; `update vendas set vendeu_closer = null, motivo_nao_fechamento = null, observacoes = null where agendamento_id = <id>` (preserva `vendeu`, `valor`, `produto`, `venda_origem`, `lead_revenue`); `logAudit("reverter_status", ...)` com status de origem/destino e motivo; invalida caches `agendamentos` e `vendas-*`.
- Visibilidade da ação controlada por `isAdminLike` (gestor/moderador/supervisor/apresentador), já existente no arquivo.
- Nenhuma mudança em métricas, RLS ou webhooks.
