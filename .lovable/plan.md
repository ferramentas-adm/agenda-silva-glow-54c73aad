## O que está acontecendo (verificado no banco, dia 29/07)

Total real de reuniões com status `realizada` em 29/07: **98**. Cada tela aplica um recorte diferente:

| Tela | Número | Filtro aplicado |
|---|---|---|
| Agenda / Calendário | 98 | todas com status `realizada` |
| Card Taxa de Conversão | 90 | 98 − 8 de 2ª reunião (regra nova que combinamos) |
| Métricas SDRs · "Compareceu" | 88 (medido) | só as cujo SDR efetivo é SDR ativo; 10 criadas por closer/gestor ficam de fora |
| Card do Closer | 9 | só as do closer logado (ex.: Neto Benini = 9) |

Ou seja: 98 = 90 (conversão) + 8 segundas; 98 = 88 (SDR) + 10 criadas fora de SDR. O card do Closer é só o recorte individual dele.

Observação: o "92" citado não bateu com 29/07 (deu 88). Pode ser outro dia (28/07 teve 99 realizadas) ou dados em cache na tela. Confirmo isso como primeiro passo.

## O problema real

Nenhum card diz qual recorte está usando. Números diferentes na mesma tela parecem erro, mas são definições distintas — e hoje não há um "número oficial de realizadas".

## Plano

1. **Confirmar o 92**: reproduzir a aba Métricas SDRs no dia exato em que você viu 92 e identificar se é dia diferente, filtro de time ativo ou cache desatualizado. Se for cache, corrigir a invalidação da query.

2. **Padronizar a definição de "Realizadas"** com uma única regra oficial:
   - Reuniões realizadas = status `realizada`, não excluídas, não venda avulsa, **excluindo 2ª reunião** (não é call nova).
   - Aplicar essa base tanto no card "Realizadas" quanto no denominador da conversão, para que os dois sempre batam.
   - Agenda/Calendário continua mostrando o total operacional (98), pois lá o objetivo é ver todos os compromissos do dia.

3. **Tornar o recorte explícito em cada card** (subtexto curto):
   - Card Realizadas: "não inclui 2ªs reuniões (8)".
   - Métricas SDRs · Compareceu: "somente agendas de SDR (X criadas por closer/gestor fora)".
   - Card do Closer: "somente suas reuniões".

4. **Tooltip de conciliação** no card de conversão mostrando a conta: total do dia → menos 2ªs reuniões → menos calls interrompidas → base usada.

## Detalhes técnicos

- Fonte da divergência SDR: `ProdutividadeSDRTab` filtra por `effectiveSdrId` (sdr_responsavel_id || created_by) contra o conjunto `sdrProfiles` (role `sdr` + `is_sdr_override` + nomes legados), montado em `DashboardComercialPage` só com perfis `active = true`. Agendas criadas por closer/gestor somem dessa contagem.
- Card de conversão: RPC `dashboard_conversao_period` (já exclui `segunda_reuniao`, avulsas e "Call Interrompida").
- Card "Realizadas": hoje conta direto do pool de agendamentos sem exclusões — é o ponto a alinhar.
- Nenhum dado é alterado; só a forma de contar e rotular.
