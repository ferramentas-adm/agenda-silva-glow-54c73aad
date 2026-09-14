# Venda avulsa no mesmo dia da reunião deve contar como 1ª call

## O que os dados mostram (verificado)

A venda de 12/09 que aparece em "De 1ª call" e não entra na Taxa de Conversão é a da **Leslie Litano Tealdi Nascimento**, lançada pelo botão "Nova venda avulsa". Ela tem, no mesmo dia 12/09, **uma reunião real às 15:00 com status realizada** (closer Geraldo, que já marcou "vendeu = sim" no resultado). O lançamento avulso criou um segundo registro paralelo, com telefone digitado incompleto, marcado como venda avulsa — e a Taxa de Conversão, por regra, ignora vendas avulsas. Daí o "0 de 29".

Ou seja: não é erro de cálculo, é uma venda lançada como avulsa quando existia a reunião de 1ª call do próprio dia.

## O que muda

### 1. Dupla verificação no botão "Nova venda avulsa"

Ao clicar em "Registrar venda", antes de salvar, o sistema procura reuniões reais do mesmo lead (por telefone ou por nome) com data igual à data da venda. Se encontrar, abre uma confirmação:

- Título: "Existe reunião deste lead no mesmo dia"
- Mostra a reunião encontrada (data, hora, closer e status)
- Três opções:
  - **Vincular como venda de 1ª call** (recomendado) — a venda é lançada na reunião real, entra na Taxa de Conversão e nenhum registro paralelo é criado
  - **Registrar como follow-up / 2ª reunião** — venda lançada na reunião real, marcada como follow-up (fora do numerador de 1ª call)
  - **Seguir como venda avulsa** — mantém o comportamento atual
- Se não existir reunião no mesmo dia, o fluxo salva direto, como hoje.

Quando vincular à reunião real, os valores digitados (produto, coletado, total do projeto, descrição) são gravados na venda daquela reunião, preservando o que o closer já havia registrado (faixa de faturamento, observações).

### 2. Correção do caso da Leslie (12/09)

Mover a venda de R$ 5.000 para a reunião real de 12/09 15:00 (marcada como 1ª call) e desfazer o registro avulso duplicado, para o dia 12/09 passar a mostrar a conversão correta. Isso mexe em dados já gravados, então só faço com a sua confirmação.

## Detalhes técnicos

- `src/components/dashboard/AvulsaSaleDialog.tsx`:
  - No `handleSubmit`, antes dos inserts, consultar `agendamentos` com `deleted_at is null`, `is_venda_avulsa = false`, `scheduled_date = dateStr` e telefone (dígitos, casando por sufixo de 8+ dígitos) **ou** `lead_name ilike`; guardar o resultado em estado e abrir um `AlertDialog` de decisão.
  - Novo caminho "vincular": `upsert` em `vendas` por `agendamento_id` da reunião real com `vendeu: true`, `valor`, `valor_total_projeto`, `produto`, `resumo_venda`, `closed_at = dateStr`, `venda_origem = 'primeira_call' | 'follow_up'`, `follow_up`/`segunda_reuniao` conforme a escolha, sem sobrescrever `lead_revenue`, `vendeu_closer` e `observacoes` existentes; garantir `agendamentos.status = 'realizada'` e registrar `status_antes_venda` se ainda nulo (mesma lógica do `GestorVendaDialog`). Nenhum agendamento fantasma é criado.
  - Caminho "seguir avulsa" mantém o código atual intacto.
  - `logAudit` nas duas rotas, distinguindo `venda_avulsa_vinculada_reuniao` de `venda_avulsa_registrada`.
- Correção da Leslie: update em `vendas` (a2f1a8ec…) e no registro avulso, sem apagar histórico; sem migração.
- Sem alteração na RPC `dashboard_conversao_period`, no lote diário do CRM ou em qualquer outro cartão.
- Registrar a nova regra no `roadmap.md`.

## Validação

- 12/09 após a correção: Taxa de Conversão deixa de ser 0 de 29 e passa a contar a venda da Leslie; "Total subidas" continua 2.
- Novo lançamento avulso com reunião no mesmo dia passa a pedir a escolha; sem reunião no mesmo dia, salva direto como hoje.
