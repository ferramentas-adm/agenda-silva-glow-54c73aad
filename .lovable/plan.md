## Mudanças

### 1. Remover toggle "Mentoria 5K" do agendamento
- `src/pages/AgendarPage.tsx` (linhas 654-660): remover o bloco do `<Switch id="is-5k-toggle">` e label.
- Manter o estado `is5k` como `false` fixo (ou remover usos) para não quebrar o submit. Verificar referências a `is5k` no arquivo e simplificar (passar sempre `false`).

### 2. Ocultar faixas vermelha/âmbar de slot lotado para Closers
- `src/pages/DashboardPage.tsx` (linhas 795-829): envolver o bloco `{(slotAlerts.full.length > 0 || slotAlerts.nearly.length > 0) && ...}` em condição `role !== "closer"`.
- `src/components/agendar/TimeSlotPicker.tsx` (bloco "Faixa de aviso"): envolver o bloco das faixas (`fullSlots`/`nearlyFullSlots`) em condição `role !== "closer"`.
- Manter os badges nos próprios botões de horário (indicador `slotCount/slotLimit`) — usuário pediu apenas para tirar **as faixas**.

Nenhuma alteração em banco, RLS ou lógica de bloqueio. Apenas UI.
