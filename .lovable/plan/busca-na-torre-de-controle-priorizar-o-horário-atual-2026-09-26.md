# Busca na Torre de Controle: priorizar o horário atual

Ao buscar por nome, closer ou telefone, a Torre hoje pula direto para os resultados do dia inteiro, o que afasta o painel do horário que o gestor está acompanhando. A busca passa a funcionar em dois níveis.

## Comportamento novo

1. **Busca sempre começa no horário selecionado** — ao digitar, a lista mostra apenas as reuniões daquela hora (01h–59min) que correspondem ao termo, com a mesma lógica de casamento de hoje (nome do lead, nome do closer ou telefone com 3+ dígitos).
2. **Botão "Ampliar para o dia inteiro"** — aparece quando o termo é digitado. Ao clicar, a busca cobre todas as horas de hoje (comportamento atual), e o botão vira "Voltar para {hh}h" para retornar ao horário filtrado sem apagar o termo.
3. Os contadores de presença no topo continuam refletindo exatamente o que está na lista.
4. Mensagens de "nenhum resultado" mudam conforme o nível: no horário ("Nenhuma reunião neste horário corresponde a 'X'") e no dia inteiro ("Nenhuma reunião encontrada hoje para 'X'").

## O que muda

- **`src/components/calendar/TorreControleDialog.tsx`** (único arquivo): novo estado de busca ampliada; o filtro por termo passa a aplicar também à lista da hora; a consulta do dia inteiro só roda quando a busca ampliada está ativa; dois botões de troca de nível na área da busca.

Nenhuma outra tela ou consulta é alterada.
