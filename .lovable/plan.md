# Enviar dados completos da 2ª reunião no webhook do DataCrazy

## Objetivo

Quando o closer marcar **"Sim — marcar segunda reunião"** no diálogo de Resultado, o webhook disparado pelo INSERT do novo agendamento deve carregar, no mesmo POST, todos os campos preenchidos no diálogo (faturamento, motivo, explicação, valor apresentado, recebimento acordado, briefing) — para que o DataCrazy faça um único mapeamento.

## Estratégia

O trigger `notify_status_change_webhook` já dispara no INSERT do novo agendamento. Vamos:

1. **Marcar o novo agendamento** com `meeting_reason = 'segunda_reuniao'`, `original_agendamento_id = <id da reunião de origem>` e `briefing = observacoes do diálogo` para o trigger encontrar a venda original.
2. **Reordenar** o frontend para criar o `pagamento` (recebimento acordado) **antes** do INSERT do novo agendamento, garantindo que o trigger consiga lê-lo.
3. **Atualizar o trigger** para, quando for INSERT de 2ª reunião com `original_agendamento_id`, juntar dados de `vendas` (faturamento, motivo, explicação, valor) e `pagamentos` (recebimento acordado) do agendamento de origem e incluir no payload.

## Mudanças

### 1. `src/components/VendaDialog.tsx`

No bloco de criação da 2ª reunião (atualmente em ~linha 348), além dos campos já existentes, adicionar:

- `briefing: observacoes.trim()` — corresponde ao campo "Descreva brevemente o que o cliente faz" do diálogo
- `meeting_reason: "segunda_reuniao"`
- `original_agendamento_id: agendamentoId`

E **mover o bloco de criação do pagamento** (atualmente em ~linha 391) para **antes** do INSERT do novo agendamento, para que o trigger encontre o recebimento ao montar o payload.

Sem mudanças em campos, validações ou UI.

### 2. Migration — atualizar `notify_status_change_webhook`

Adicionar, dentro do branch não-deleção, lógica que detecta `TG_OP = 'INSERT' AND NEW.meeting_reason = 'segunda_reuniao' AND NEW.original_agendamento_id IS NOT NULL`. Quando verdadeiro, buscar:

- De `vendas` (joined pelo `agendamento_id = NEW.original_agendamento_id`):
  - `lead_revenue` → `lead_revenue`
  - `motivo_nao_fechamento` → `motivo_nao_fechamento`
  - `explicacao_nao_fechamento` → `explicacao_nao_fechamento`
  - `valor` → `valor_apresentado`
- De `pagamentos` (mesmo `agendamento_id`):
  - Se existir registro: `recebimento_acordado = true`, `valor_previsto`, `data_prevista`
  - Se não existir: `recebimento_acordado = false`, `valor_previsto = null`, `data_prevista = null`

E mesclar ao `_payload` já existente. O `briefing` já entra naturalmente porque `NEW.briefing` será preenchido pelo frontend. Demais reuniões (1ª, reagendamentos, cancelamentos, follow-up regular) continuam recebendo o payload atual sem alteração.

## Fora de escopo

- Não muda nenhum outro tipo de evento (1ª reunião, reagendamento, cancelamento, no-show, exclusão).
- Não cria edge function nova.
- Não altera nenhum campo do diálogo de Resultado (briefing já é obrigatório via `observacoes`).
- Não altera RLS, schema de tabelas ou tipos.

## Teste após aprovar

Após a build, faço um INSERT de teste via `supabase--insert` simulando o fluxo completo (venda + pagamento + 2ª reunião) e confirmo no log que o payload chega com todos os campos novos preenchidos.
