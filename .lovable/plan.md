# Cancelamento e reagendamento do SDR IA

## Implementação

- Criar `POST /silva-cancelar` com a mesma autenticação, CORS e formato de validação do `/silva-agendar`. O endpoint localizará a reunião ativa, devolverá 404 quando ausente, impedirá alteração de reunião realizada ou cujo horário já passou, e tratará cancelamento repetido como sucesso idempotente.
- Ao cancelar, manter o Meet intacto, gravar `status=cancelada`, motivo e autoria, registrar auditoria e deixar os gatilhos atuais notificarem o fluxo de lembretes/closer. Como a disponibilidade já ignora canceladas, o horário e a vaga de overbooking serão liberados automaticamente.
- Criar `POST /silva-reagendar` validando primeiro o novo `slot_id` com a mesma grade, bloqueios, closer ativo e capacidade normal +3 do SDR IA. Slot inválido retornará 409 sem tocar na reunião antiga.
- Criar a nova reunião com os dados herdados do lead, briefing, origem e canal, preservar o vínculo com a reunião original, atribuir o closer indicado quando elegível e gerar Calendar/Meet pelo mesmo fluxo de `/silva-agendar`. Depois, encerrar a antiga como cancelada com motivo de reagendamento; os gatilhos existentes enviarão a confirmação da nova e cancelarão o fluxo pendente da antiga.
- Adicionar as duas funções à configuração de implantação e testes focados em autenticação, payload, idempotência, reunião passada e lotação.

## Validação

- Implantar os endpoints e conferir respostas sem chave, payload inválido e registros inexistentes.
- Chamar `/silva-cancelar` para o agendamento `5acf1124-cb5d-45f4-bc79-4674b86e98af`, com o motivo informado, e confirmar no banco que o status, motivo, horário e closer ficaram corretos.
- Entregar exemplos `curl` dos dois contratos.

## Detalhes técnicos

- Datas e comparações usarão `America/Sao_Paulo`.
- A criação da nova reunião reutilizará helpers compartilhados para evitar divergência futura entre agendar e reagendar.
- `/silva-reunioes`, `/silva-vendas` e o payload do CAPI não serão alterados.
