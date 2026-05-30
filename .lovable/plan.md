## Objetivo
Permitir alternar a tabela "Agendas Para … — por Canal" (e a gêmea "Criadas") entre mostrar **todas as agendas** e somente as **realizadas**, com um botão no cabeçalho da tabela.

## Mudanças (somente `src/pages/DashboardComercialPage.tsx`)

1. **`byChannel(list)` (~linha 328):** retornar, além de `ids` (todas) e `qtd`, também `idsRealizadas` e `qtdRealizadas` — agrupando os agendamentos por canal e separando os com `status === "realizada"`.

2. **`ChannelTable` (~linha 711):**
   - Adicionar estado local `mode: "todas" | "realizadas"`.
   - No cabeçalho do card (ao lado do título), adicionar um toggle compacto (dois botões `Todas` / `Realizadas`) usando tokens do design system.
   - A coluna "Qtd" e a ordenação passam a refletir o modo selecionado; linhas com `qtd === 0` no modo atual ficam ocultas.
   - `onRowClick` envia os `ids` correspondentes ao modo (todas ou só realizadas) para o drilldown existente.

3. **Título dinâmico no drilldown:** quando o modo for "realizadas", concatenar " · Realizadas" ao título passado ao `openDrill` (apenas no callback `onRowClick` das duas instâncias ~linhas 928–935).

## Fora de escopo
- Nada de mudança no backend, queries ou business logic. Só presentation/UI.
- Não altero a tabela de SDR/Closer, apenas as duas `ChannelTable`.

Confirma que posso seguir?