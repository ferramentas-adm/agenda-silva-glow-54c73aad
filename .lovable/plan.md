
## O que fazer

Adicionar um botão **Exportar CSV** no cabeçalho de cada card `ChannelTable` do componente `src/components/dashboard/AgendasPorCanalPanel.tsx` (aba Vendas do Dashboard).

O export respeita o modo ativo (**Todas / Realizadas / Vendas**) e o período selecionado.

## Colunas do CSV

- **Nome do lead**
- **Telefone**
- **Canal**
- **Status do agendamento** (agendada, realizada, cancelada, no_show, reagendada)
- **Data da reunião**
- **Vendeu** (Sim / Não / —)
- **Valor da venda** (R$, vazio quando não houver venda)
- **Motivo não fechamento** (quando aplicável)

Assim você consegue cruzar no PROCV tanto leads agendados quanto realizados/comprados, e ver valor por criativo.

## Como funciona

1. Botão "Exportar" (ícone Download) ao lado das abas Todas/Realizadas/Vendas em cada card.
2. Ao clicar, pega os `agendamento_id` das linhas visíveis (já filtradas pelo modo) e busca em lotes:
   - `agendamentos`: `id, lead_name, lead_phone, channel_type, status, scheduled_date`
   - `vendas`: `agendamento_id, vendeu, valor, motivo_nao_fechamento` (LEFT JOIN em memória pelo `agendamento_id`)
3. Gera CSV UTF-8 com BOM, separador `;` (abre direto no Excel BR), e baixa como:
   `agendas-{para|criadas}-{modo}-{periodo}.csv`

## Detalhes técnicos

- Tudo dentro de `AgendasPorCanalPanel.tsx`, sem nova dependência.
- Paginação por `.in("id", ids)` em chunks de 500.
- Escapagem: aspas duplas, quebras de linha removidas.
- Botão com estado `loading` durante a busca + toast de sucesso/erro.

## Fora de escopo

- Não adiciono export em outros painéis nem no dashboard inteiro — só nesses dois cards.
