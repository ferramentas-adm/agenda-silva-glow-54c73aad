## Objetivo

Adicionar um filtro "Apenas criados por SDR" na página `/reunioes` para permitir bater 100% com o card "Agendas Geradas Hoje" do Dashboard Comercial.

Combinado com o filtro já existente "Excluir reagendamentos", o total da Lista passará a coincidir exatamente com o card (mesma regra: agendas novas + criador é SDR).

## Mudanças

### `src/pages/ReunioesListPage.tsx`

1. **Novo estado** `onlyCreatedBySdr: boolean` (default `false`).
2. **Carregar lookup de SDRs** — buscar `user_id` de perfis com role `sdr` via `user_roles` (mesma lógica usada em `ProdutividadeSDRTab`: SDR efetivo = `sdr_responsavel_id || created_by`, precisa pertencer ao conjunto de SDRs).
   - Reutilizar hook existente se houver; caso contrário, query pontual com cache local via `useMemo`/`useEffect`.
3. **Nova pill de filtro** ao lado de "Excluir reagendamentos":
   - Label: "Apenas criados por SDR"
   - Ícone: `UserCheck` (lucide) ou similar coerente com as outras pills.
   - Ativa/desativa como as demais.
4. **Aplicar filtro** na lista renderizada: quando ativo, manter apenas registros cujo SDR efetivo pertence ao conjunto de SDRs conhecidos.
5. **Badge de contagem** — estender o breakdown atual para refletir também os descartados por não serem de SDR quando o filtro estiver ativo (ex.: tooltip "8 descartados: criados por closer/gestor").
6. **Tooltip explicativo** curto na pill informando que serve para conciliar com o card do Dashboard Comercial.

### Nenhuma mudança de backend

Sem alteração de schema, RLS, edge function ou tipos gerados. É filtragem puramente client-side sobre dados já carregados.

## Detalhes técnicos

- SDR efetivo por registro: `sdr_responsavel_id ?? created_by`. Se `null` ou não estiver no set de SDRs → excluir quando filtro ativo.
- Set de SDRs derivado de `user_roles` onde `role = 'sdr'`. Query única na montagem da página; escopo `authenticated`.
- Ordem dos filtros no header preservada; nova pill entra imediatamente após "Excluir reagendamentos" para agrupar visualmente os filtros de conciliação com o card.

## Fora do escopo

- Alterar o card do Dashboard Comercial.
- Persistir preferência do filtro entre sessões.
- Mudar cálculos do `ProdutividadeSDRTab`.