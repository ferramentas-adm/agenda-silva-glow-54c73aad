

## Correção do erro "duplicate key" no pop-up Resultado da Reunião

**Problema:** Ao confirmar o pop-up de Vendas, o sistema tenta inserir um novo registro na tabela `vendas`, mas já existe uma venda registrada para aquele agendamento (constraint `UNIQUE` em `agendamento_id`). Isso acontece quando:
1. O Closer reabre o pop-up de uma reunião já marcada como "Realizada".
2. Houve duplo-clique no botão Confirmar.
3. Outro usuário já registrou o resultado.

## Solução

### 1. Trocar `INSERT` por `UPSERT` em `VendaDialog.tsx`
Substituir `supabase.from("vendas").insert({...})` por `.upsert({...}, { onConflict: "agendamento_id" })`. Assim, se já existir registro para o agendamento, ele será atualizado em vez de gerar erro.

### 2. Pré-carregar dados existentes ao abrir o diálogo
Quando o pop-up abrir, fazer um `SELECT` em `vendas` filtrando por `agendamento_id`. Se já existir registro, preencher o formulário com os valores atuais (Vendeu, Valor, Motivo, Follow-up, Observações) — permitindo edição em vez de bloquear o usuário.

### 3. Indicação visual de edição
- Se houver venda pré-existente: trocar título do pop-up para "Editar Resultado da Reunião" e exibir um pequeno texto "Atualizando registro existente".
- Caso contrário: manter "Resultado da Reunião" (criação nova).

### 4. Proteção contra duplo-clique
Manter o `submitting` desabilitando o botão Confirmar (já existe), garantindo que cliques rápidos não gerem chamadas duplicadas.

### 5. Tratamento de erro amigável
Caso ainda ocorra qualquer erro de duplicidade (corrida entre abas), exibir toast: "Já existe um resultado registrado para esta reunião. Atualize a página para visualizar."

## Arquivos a serem alterados
- `src/components/VendaDialog.tsx` — adicionar fetch inicial, trocar insert por upsert, ajustar título dinâmico e mensagem de erro.

## Resultado esperado
- Closer pode registrar o resultado uma vez sem erro.
- Closer pode reabrir e **editar** o resultado de uma reunião já realizada.
- Nenhum erro técnico aparece para o usuário final.

