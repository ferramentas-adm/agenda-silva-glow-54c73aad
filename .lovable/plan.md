# Motivos de não comparecimento e contagem nos quadros

## Lista de motivos
Nova lista padrão (editável em Administração > + Listas):
- No-show
- Cancelou por desistência
- Cancelou por imprevisto pessoal
- Sem closer disponível (novo)
- Alterou horário para o mesmo dia
- "Outros" removido (com campo de texto livre)

## Como cada motivo é contabilizado
| Motivo | Quadro |
|---|---|
| No-show | No-show |
| Cancelou por desistência | Cancelado |
| Cancelou por imprevisto pessoal | Cancelado |
| Sem closer disponível | Cancelado |
| Alterou horário para o mesmo dia | Nenhum, se existir novo agendamento do mesmo lead no mesmo dia; caso contrário conta como No-show |

O card "Não comparecimento" passa a somar apenas Cancelado + No-show (já com a regra acima).

## Cards removidos
- "Reagendadas" no painel de contadores da tela Calendário/Dashboard
- "Reagendado — Hoje" nas Métricas de Agendamentos (Dashboard Comercial)

## Detalhes técnicos
- `src/components/NaoCompareceuDialog.tsx`: adicionar "Sem closer disponível" a `DEFAULT_NO_SHOW_REASONS`, remover a opção "Outros" e o campo de texto livre (motivo passa a ser obrigatório da lista).
- Novo módulo `src/lib/noShowReasons.ts` com a classificação (`CANCEL_REASONS`, `SAME_DAY_RESCHEDULE_REASON`) e a função `classifyNaoCompareceu(agendamento, sameDayAgendas)` retornando `"cancelada" | "no_show" | "ignorado"`. Base: campo `cancellation_reason` já gravado hoje pelo diálogo (status persistido continua `no_show`).
- Regra "mesmo dia": procura outra agenda do mesmo lead (telefone normalizado) com a mesma `scheduled_date`, criada depois; se encontrada, o registro não entra em nenhum quadro.
- `src/pages/DashboardPage.tsx`: contar Canceladas / No-shows / Não comparecimento pela classificação por motivo (não mais só por `status`), mantendo os registros antigos com `status='cancelada'` em Cancelado; remover o card "reagendada".
- `src/pages/DashboardComercialPage.tsx`: aplicar a mesma classificação em `noShow*`/`cancelado*` (contagem e drill-down) e remover `reagendado`/`reagendadoIds` e o card correspondente.
- Nenhuma alteração de banco: nada é apagado, apenas a leitura das métricas muda.
