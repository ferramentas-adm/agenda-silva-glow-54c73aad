# `/silva-agendar` com closer e Meet imediatos

## Objetivo

Fazer novos agendamentos do SDR IA João Amorim nascerem atribuídos ao closer indicado pelo `slot_id`, seguindo o mesmo fluxo já usado quando o painel cria uma reunião com closer: evento/Meet antes do registro, status `agendada`, confirmação pelo fluxo existente e retorno imediato do closer/link.

## Estado atual confirmado

- `/silva-disponibilidade` já retorna `slot_id` no formato `<inicio ISO>|<closer_id>` e escolhe, entre os livres, o closer com menor quantidade de reuniões no dia; o desempate atual é pelo nome.
- `/silva-agendar` lê o closer sugerido, mas grava sempre `closer_id=null`, `status="pendente"`, sem Meet e na fila “Aguardando atribuição”.
- O fluxo com closer do painel chama `google-create-event` antes do INSERT e grava `closer_id`, `meet_link`, `google_event_id` e `status="agendada"` juntos.
- O INSERT com closer já aciona o webhook existente de confirmação/CRM; outro gatilho existente dispara o evento `Schedule` no Meta. Esses gatilhos não precisam ser alterados.
- `google-create-event` hoje exige uma sessão de usuário. O SDR IA usa `SDR_IA_API_KEY`, então será necessária uma autorização interna mínima nessa mesma função, sem duplicar ou refatorar sua lógica de Calendar/Meet.

## Implementação

### 1. Interpretar o `slot_id`

- Aceitar `slot_id="<inicio ISO>|<closer_id>"` e validar ISO, UUID e coerência com `inicio` quando ambos forem enviados.
- Quando houver apenas `inicio`, `slot_id` sem closer ou formato legado válido sem closer, manter o comportamento atual de fila.
- Um `slot_id` com closer malformado continua entrando no erro padrão `400 {"erro":"payload_invalido","campos":{...}}`, em vez de atribuir outro closer silenciosamente.

### 2. Revalidar imediatamente antes de criar

Para o closer recebido no `slot_id`, recarregar a disponibilidade do dia e exigir:

- horário dentro da grade configurada e respeitando o corte já existente;
- lotação global do horário abaixo da capacidade;
- closer ativo e elegível;
- nenhuma reunião ativa dele naquele horário;
- nenhuma folga, bloqueio pessoal ou bloqueio em massa efetivo, considerando liberações/exceções.

Se qualquer regra falhar, interromper sem criar Meet nem registro e responder exatamente:

```json
{"erro":"slot_indisponivel"}
```

com HTTP 409. Não substituir automaticamente o closer por outro.

### 3. Reutilizar o fluxo atual de Google Meet

- Autorizar `google-create-event` a receber uma chamada interna autenticada por `SDR_IA_API_KEY`, além da autenticação de usuário que já existe.
- Manter intacta toda a lógica atual dessa função: tokens do closer, Calendar, Meet, gravação/transcrição automática e fallback.
- `/silva-agendar` chama essa mesma função antes do INSERT, com os mesmos dados usados pelo painel.
- Se o Google não devolver o link, criar mesmo assim a reunião atribuída ao closer, com `meet_link`/`google_event_id` nulos; ela não deve voltar para a fila.

### 4. Criar o agendamento

Com closer válido e livre, inserir o registro com:

- `closer_id` do `slot_id`;
- `status="agendada"`;
- `meet_link` e `google_event_id` retornados, quando disponíveis;
- os mesmos dados atuais de João Amorim, briefing, origem, canal, CRM, telefone e idempotência.

Isso fará os mecanismos já existentes executarem o fluxo esperado:

- webhook de confirmação/CRM com closer e link;
- automação de lembretes associada ao status;
- tag `agendamento` no DataCrazy;
- evento `Schedule` no Meta CAPI.

Não será criado um caminho paralelo nem alterado o disparo do CAPI.

### 5. Fallback para a fila

Quando não vier closer no `slot_id`, manter exatamente o comportamento atual:

- `closer_id=null`;
- `status="pendente"`;
- sem Meet/evento;
- `fila_atribuicao=true`.

A observação “Closer sugerido” só será mantida nesse fallback; não será gravada quando o closer já estiver atribuído.

### 6. Resposta e idempotência

Com closer:

```json
{
  "agendamento_id": "...",
  "inicio": "...",
  "closer": "Nome",
  "link_reuniao": "https://meet.google.com/...",
  "fila_atribuicao": false
}
```

Se o link não estiver disponível, `link_reuniao` será `null` e `fila_atribuicao` continuará `false`.

Sem closer, retornar `closer:null`, `link_reuniao:null` e `fila_atribuicao:true`.

Uma repetição com a mesma `idempotency_key` devolverá os dados reais do registro já criado, incluindo closer e link, sem criar outro evento ou agendamento.

### 7. `decisor_presente`

- Aceitar boolean ou string.
- Boolean permanece igual.
- String normalizada `"nao"` ou `"não"` vira `false`; qualquer outra string vira `true`.
- Manter o formato atual de erro 400 para os demais dados inválidos.

## Escopo preservado

- Não alterar `/silva-reunioes` nem `/silva-vendas`.
- Não alterar funções, gatilhos ou payloads do Meta CAPI.
- Não modificar `/silva-disponibilidade`, salvo se um teste revelar regressão; sua regra atual de menor carga diária será preservada.
- Não atualizar retroativamente nenhuma reunião já criada na fila, incluindo Allan em 14/09 às 15h e Daniela Puertas em 17/09 às 9h.
- Não alterar dados históricos.

## Validação

- Testar 401 sem `SDR_IA_API_KEY`.
- Testar boolean e string em `decisor_presente`, incluindo `"nao"`.
- Testar 409 para closer ocupado, bloqueado, em folga ou horário globalmente lotado, confirmando ausência de evento e registro.
- Testar criação com closer livre, status `agendada`, Meet, nome/link na resposta e ausência da fila.
- Testar falha do Google com reunião ainda atribuída e `link_reuniao:null`.
- Testar fallback sem closer na fila.
- Repetir a mesma `idempotency_key` e confirmar um único agendamento e um único evento.
- Confirmar nos logs que o webhook de confirmação/CRM e o `Schedule` existente ocorreram uma vez, sem alteração no CAPI.
- Verificar compilação e logs das funções após a implantação.
