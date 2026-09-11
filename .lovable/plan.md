# Payload completo do Resultado da Reunião + closer direto para o SDR IA

## 1. Completar o webhook de “Resultado da Reunião”

### Situação atual confirmada

A tela grava cinco respostas em `vendas`: faturamento do lead, declaração “Vendeu?”, order bumps, motivo de não fechamento e justificativa. Porém, o webhook atual:

- envia sempre `vendeu: false` e `outcome: "em_andamento"`, mesmo quando o closer escolhe “Sim”;
- já envia faturamento, motivo e justificativa;
- não envia `vendeu_closer` nem `order_bumps`.

### Ajuste

- Em `src/services/datacrazyVenda.ts`, incluir no contrato:
  - `vendeu_closer: boolean | null`;
  - `order_bumps: Array<{ nome: string; valor: number }> | null`.
- Em `src/components/VendaDialog.tsx`, enviar:
  - **Sim:** `vendeu_closer=true`, faturamento, justificativa opcional e order bumps;
  - **Não:** `vendeu_closer=false`, faturamento, motivo, justificativa e `order_bumps=null`.
- Preservar `vendeu=false` e `outcome="em_andamento"` nesse formulário: a escolha do closer é uma declaração, enquanto a venda oficial continua sendo lançada pelo gestor/supervisor. Assim, o CRM recebe a resposta completa sem avançar ou duplicar a venda oficial.
- Não alterar a URL do webhook, banco, tela ou fluxos de venda oficial/follow-up.

## 2. `/silva-agendar` com closer direto e Meet

### Situação atual confirmada

- `/silva-disponibilidade` já devolve `slot_id` com o closer livre de menor carga diária.
- `/silva-agendar` extrai esse closer, mas hoje grava sempre `closer_id=null`, `status="pendente"` e deixa Meet/evento vazios.
- O fluxo do painel cria o Meet antes do INSERT quando existe closer e grava o novo agendamento como `agendada`, com `closer_id`, `meet_link` e `google_event_id`.
- O INSERT já aciona os gatilhos existentes de status/CRM e `Schedule` do Meta. Esses gatilhos não serão alterados.
- A função existente `google-create-event` exige sessão de usuário; para o SDR IA reutilizá-la sem duplicar a integração Google, ela precisa aceitar também a mesma chave interna `SDR_IA_API_KEY`.

### Novo comportamento

1. Aceitar `slot_id="<inicio ISO>|<closer_id>"` e validar integralmente seu formato.
2. Recalcular a disponibilidade imediatamente antes da criação:
   - horário dentro da grade;
   - lotação global ainda abaixo da capacidade;
   - closer ativo;
   - closer sem reunião naquela hora;
   - closer sem bloqueio/folga efetiva, considerando exceções.
3. Se qualquer condição falhar, responder exatamente `409 {"erro":"slot_indisponivel"}` e não criar Meet nem agendamento.
4. Se o closer estiver livre:
   - chamar a função existente `google-create-event` com autenticação interna pela `SDR_IA_API_KEY`;
   - criar o mesmo evento/Meet usado pelo painel, incluindo gravação/transcrição automática quando configurada para o closer;
   - inserir o agendamento com `closer_id`, `status="agendada"`, `meet_link` e `google_event_id`;
   - manter briefing, SDR João Amorim, origem, canal, CRM, idempotência, auditoria e tag `agendamento` atuais.
5. Se a criação do Meet falhar, manter o comportamento tolerante do painel: criar atribuído ao closer com link nulo, sem mandar para a fila.
6. Se vier `slot_id` sem um closer válido, ou somente `inicio`, manter o fallback atual: `closer_id=null`, sem Meet e na fila “Aguardando atribuição”.
7. Não escrever mais “Closer sugerido” na observação quando o closer já tiver sido atribuído; manter apenas no fallback em fila.

### Resposta e idempotência

- Com closer: `closer="Nome"`, `link_reuniao` com o Meet quando disponível e `fila_atribuicao=false`.
- Sem closer: `closer=null`, `link_reuniao=null` e `fila_atribuicao=true`.
- Uma repetição com a mesma `idempotency_key` devolverá os dados reais já gravados, incluindo closer e link, sem criar outro evento.

### Compatibilidade de `decisor_presente`

- Aceitar boolean e string.
- Boolean permanece igual.
- String normalizada `"nao"`/`"não"` vira `false`; qualquer outra string vira `true`.
- Payload inválido mantém `400 {"erro":"payload_invalido","campos":{...}}`.

## 3. Arquivos, preservações e validação

### Arquivos

- `src/services/datacrazyVenda.ts`
- `src/components/VendaDialog.tsx`
- `supabase/functions/silva-agendar/index.ts`
- `supabase/functions/google-create-event/index.ts` — somente ampliar a autenticação para chamadas internas do SDR IA; o fluxo Google permanece único.

`/silva-disponibilidade` não precisa mudar: sua seleção atual já usa closer livre e menor carga diária, com desempate por nome.

### Não alterar

- `/silva-reunioes` e `/silva-vendas`;
- gatilhos ou payload do Meta CAPI;
- reuniões existentes na fila, incluindo Allan em 14/09 às 15h e Daniela Puertas em 17/09 às 9h;
- tabelas ou dados históricos.

### Validação

- Conferir payload do Resultado da Reunião nos caminhos “Sim” e “Não”.
- Conferir 401 sem a chave no `/silva-agendar` e na chamada interna do Google.
- Conferir 400 com `decisor_presente` inválido e conversão correta de boolean/string.
- Conferir 409 quando o closer do `slot_id` já estiver ocupado ou bloqueado.
- Conferir resposta idempotente sem segundo evento.
- Conferir que agendamento com closer nasce como `agendada`, fora da fila, com nome/link na resposta quando o Google gerar o Meet.
- Conferir fallback sem closer na fila.
- Conferir que os gatilhos existentes registram `Schedule` e enviam ao CRM uma única vez, sem modificar seu código.
- Verificar compilação e logs das funções após a implantação.
