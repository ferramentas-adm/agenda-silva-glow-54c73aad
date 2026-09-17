# Gráfico de pizza "Não comparecimento" por motivo fixo

## Problema
A pizza da aba "Não comparecimento" fatia por `cancellation_reason` cru. Esse campo guarda duas coisas:
- **Motivo** escolhido no formulário (lista fixa da tela, conforme print): No-show, Cancelou por desistência, Cancelou por imprevisto pessoal, Não acompanhado pelo SDR, Sem closer disponível, Alterou horário para o mesmo dia (+ motivos personalizados do Admin).
- **Justificativa** em texto livre digitada no cancelamento ("remarcar", "Cliente desistiu", "solicitou reagendamento", etc.) — hoje cada texto vira uma fatia, o que polui a aba.

Verificado no banco: dos registros, só ~2.000 têm motivo fixo; o resto é texto livre (dezenas de variações de "remarcar" e afins).

## Solução (só a aba, CSVs não mudam)
`src/components/dashboard/NaoComparecimentoTab.tsx`:

1. **Normalização do motivo**: comparar `cancellation_reason` com a lista de motivos (case/acento-insensitive, trim). Reusar as constantes existentes de `src/lib/noShowReasons.ts` (CANCEL_REASONS, NO_SHOW_REASON, SAME_DAY_RESCHEDULE_REASON) e os motivos personalizados carregados de `profiles`/config do Admin (mesma fonte usada pelo diálogo de não comparecimento, `NaoCompareceuDialog`).

2. **Pizza passa a agrupar por motivo fixo**:
   - Texto que casa com um motivo da lista → fatia daquele motivo.
   - Texto livre que não casa com nada → fatia única **"Outros motivos"** (agrupa todas as justificativas livres; drill-down mostra cada justificativa).
   - Vazio → mantém "Sem motivo informado".
   - Total da pizza continua igual ao card "Total não comparecimento".

3. **Drill-down** (clique na fatia/legenda): além dos dados atuais (lead, telefone, data, SDR), mostrar a **justificativa original** (texto cru do `cancellation_reason`) de cada registro da fatia.

4. **Legenda lateral** acompanha os mesmos agrupamentos (motivos fixos + "Outros motivos" + "Sem motivo informado").

## O que NÃO muda
- CSV "nunca compareceram": segue com a coluna de **Justificativa** em texto cru (é para isso que ela serve).
- Cards de resumo (Total / Cancelado / No-show / Não contabilizado) e a lógica de `classifyNaoCompareceu`.
- Nenhum dado é alterado no banco; nenhum endpoint é tocado.

## Validação
- Build OK via log de observabilidade.
- Conferir no preview que a pizza tem só as fatias dos motivos (casando com o print) e que "Outros motivos" agrupa os textos livres.
