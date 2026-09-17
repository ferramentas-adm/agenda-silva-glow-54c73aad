# CSV de leads que nunca compareceram

## Onde fica o botão

No **Dashboard Comercial > aba "Não comparecimento"**, no topo à direita, ao lado do filtro de SDR: botão **"Baixar CSV — nunca compareceram"**.

É o lugar natural: essa aba já mostra os motivos de não comparecimento do período, com os mesmos filtros (data da reunião ou de criação, período e SDR). O botão baixa exatamente o que está filtrado na tela.

## O que o arquivo traz

Uma linha por lead que não compareceu no período e que **nunca teve nenhuma reunião realizada** com a empresa — em nenhuma data, antes ou depois. Se o lead compareceu em qualquer outro agendamento, ele fica fora da lista.

Colunas:

- Nome do lead
- Telefone (padrão 5511998765432)
- Data da reunião
- Hora
- Situação (Não compareceu / Cancelada)
- Justificativa do não comparecimento (ou "Sem motivo informado")
- Quantas vezes não compareceu (total histórico do lead)
- SDR responsável
- Closer

Um lead com vários não comparecimentos no período aparece uma vez, com o registro mais recente e a contagem total.

## Detalhes técnicos

- `src/components/dashboard/NaoComparecimentoTab.tsx`:
  - novo botão de download que reaproveita `filtered` (já respeita período, campo de data e filtro de SDR);
  - a query principal passa a trazer também `closer_id` → nome do closer (join `closers ( name )`);
  - nova query (lazy, disparada no clique) que busca em `agendamentos` todos os registros com `status = 'realizada'` e `deleted_at is null` cujos telefones normalizados estejam entre os leads do período (em lotes de ~300 telefones), montando um `Set` de telefones que já compareceram;
  - agrupamento por telefone normalizado (mesma normalização já usada em VendasTab: só dígitos, com DDI 55), exclusão dos telefones presentes no `Set`, e geração do CSV com `;` e BOM UTF-8, nome `leads-nunca-compareceram-<periodo>.csv`;
  - leads sem telefone são agrupados por nome normalizado.
- Nenhuma alteração de banco, de RPC do dashboard, de contagens existentes ou dos gráficos da aba.
