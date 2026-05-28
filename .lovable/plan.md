## Correções

**1. Card "Total Closers" (inconsistência 41 vs 42)**

Hoje:
- `Total agend. dia` = 41 (exclui canceladas) ✓
- `Total Closers` = 2 (inclui 1 cancelada do Leandro Ritte + 1 agendada do Matheus) ✗

Fazer `closerCreatedCount` excluir canceladas, igual ao Total. Resultado: SDR=40 + Closer=1 = Total=41 (matemática consistente).

Arquivo: `src/pages/DashboardPage.tsx` linha 397-401.

**2. Bloqueio não dispara para reuniões "Confirmada" que são reagendadas**

Reuniões com `status='reagendada'` + `original_agendamento_id` são exibidas como "Confirmada" no calendário (via `getEffectiveStatus`), mas o overlay de bloqueio (`useOverdueMeetings`) busca apenas `status IN ('agendada','confirmada')` — ignorando essas.

Casos confirmados no banco:
- Bruno: 23/05 10h (Thais Campos)
- Igor: 25/05 11h, 18h, 21h
- Pedro Ferro: 26/05 10h

Corrigir: incluir `reagendada` no filtro e, em JS, manter apenas as que têm `original_agendamento_id` (o registro novo, exibido como Confirmada). As reagendadas "antigas" (sem `original_agendamento_id`) representam a reunião movida para outra data e não devem bloquear.

Arquivo: `src/hooks/useOverdueMeetings.ts` — query e filtro pós-fetch.