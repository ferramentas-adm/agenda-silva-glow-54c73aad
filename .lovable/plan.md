# Completar o webhook de “Resultado da Reunião”

## O que será ajustado

Hoje a tela grava todos os campos no painel, mas o envio ao CRM não representa tudo: a escolha **Vendeu?** é enviada sempre como `vendeu: false` e os **order bumps** escolhidos no caminho “Sim” não entram no payload. Faturamento, motivo de não fechamento e justificativa já são enviados.

O webhook passará a enviar, em ambos os caminhos, todos os dados preenchidos na tela:

- `lead_revenue`: faturamento do lead;
- `vendeu_closer`: `true` para “Sim” e `false` para “Não”;
- `motivo_nao_fechamento`: motivo selecionado quando “Não”;
- `observacoes`: justificativa digitada;
- `order_bumps`: lista de `{ nome, valor }` quando “Sim”, ou `null` quando não houver;
- os dados já existentes de identificação: agendamento, lead, telefone, closer, SDR e horário do registro.

## Regra importante

A resposta do closer continuará sendo uma **declaração da reunião**, não uma venda oficial. Portanto:

- `vendeu_closer` refletirá exatamente o botão escolhido;
- `vendeu` continuará `false` e `outcome` continuará `em_andamento` até o gestor/supervisor lançar a venda oficial;
- isso evita avançar indevidamente o lead no CRM ou duplicar uma venda;
- quando o gestor lançar a venda, o webhook oficial continuará enviando `vendeu: true`, produto, valor, origem e demais dados da venda.

## Arquivos e validação

- Atualizar o contrato de payload em `src/services/datacrazyVenda.ts` para tipar `vendeu_closer` e `order_bumps`.
- Atualizar `src/components/VendaDialog.tsx` para incluir os dois campos com os valores realmente salvos.
- Não alterar a tela, o banco, a URL do webhook nem os demais fluxos de venda/follow-up.
- Validar os dois cenários:
  - **Sim:** faturamento, `vendeu_closer=true`, justificativa opcional e order bumps selecionados;
  - **Não:** faturamento, `vendeu_closer=false`, motivo, justificativa obrigatória e `order_bumps=null`.
- Confirmar que o projeto continua compilando sem erros.
