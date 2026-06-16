## Restaurar "Call Interompida" no card de Motivos de Não Fechamento

Hoje `vendasDiaParaMotivos` deriva de `vendasDia`, que já exclui Call Interompida — então o motivo sumiu desse card.

### Mudança (uma única função em `src/components/dashboard/VendasTab.tsx`)

Reescrever `vendasDiaParaMotivos` para usar a base completa (sem o filtro de Call Interompida), aplicando apenas: status `realizada`, escopo de closer logado, período (data efetiva de fechamento) e filtros do card (closer/canal).

Resultado: Call Interompida volta a aparecer e ser contada no card de Motivos, sem afetar a Taxa de Conversão nem os demais KPIs (que continuam usando `vendasDia`).