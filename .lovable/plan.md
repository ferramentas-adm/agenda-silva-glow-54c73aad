# Campo Telefone na "Nova venda avulsa"

Adicionar o telefone do cliente ao formulário de venda avulsa, salvo junto com os demais dados.

## O que muda

- Novo campo **Telefone (WhatsApp)** logo abaixo de "Nome do cliente", ocupando meia largura ao lado do nome em telas maiores.
- Máscara automática brasileira ao digitar: `(11) 99999-9999` / `(11) 9999-9999`.
- Campo **obrigatório** (mesmo peso do nome): o botão "Registrar venda" só habilita com pelo menos 10 dígitos.
- O telefone é gravado no registro da venda avulsa, no mesmo campo de telefone usado por todos os agendamentos — então já aparece nas listas, nos detalhes do lead e nos endpoints/integrações que enviam o WhatsApp do lead, sem qualquer ajuste extra.

## Detalhes técnicos

- Alterar apenas `src/components/dashboard/AvulsaSaleDialog.tsx`.
- Novo estado `leadPhone`, resetado no fechamento do modal, incluído na validação (`valid`).
- No insert em `agendamentos`, substituir `lead_phone: ""` pelo telefone digitado (guardado com a formatação, igual ao restante do sistema; as consultas já normalizam dígitos).
- Sem mudanças de banco de dados — a coluna `lead_phone` já existe e é obrigatória.
