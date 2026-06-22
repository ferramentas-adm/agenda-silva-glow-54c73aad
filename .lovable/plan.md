## Ajustes na página "Aguardando atribuição"

### 1. Considerar apenas reuniões de hoje em diante (sem seletor de data)
Em `src/pages/AguardandoAtribuicaoPage.tsx`, adicionar filtro fixo `.gte("scheduled_date", hoje)` (data local de São Paulo, formato `YYYY-MM-DD`) na query `pending-closer-assignment`. Não há UI de seleção de data — o corte é automático e sempre considera o dia atual em diante. Reuniões passadas sem closer somem da fila.

O badge no menu lateral (contador em `AppLayout.tsx`) também passa a contar só de hoje em diante, para ficar consistente com a página.

### 2. Remover Amanda Padilha da lista de Closers atribuíveis
Na mesma página, na query `closers-active`, excluir Amanda Padilha do dropdown com `.not("name", "ilike", "%amanda padilha%")`. Assim, a reunião continua "solta" até que outro Closer seja selecionado manualmente — só então o webhook do DataCrazy e o Google Calendar/Meet são disparados (fluxo atual já faz isso na atribuição).

### Fora de escopo
- Não mexer no cadastro da Amanda (segue ativa como closer no banco para histórico/relatórios).
- Não mexer no fluxo de criação do SDR (já cria com `closer_id = null`).

### Arquivos
- `src/pages/AguardandoAtribuicaoPage.tsx` — filtro de data + exclusão da Amanda Padilha do dropdown.
- `src/components/AppLayout.tsx` — mesmo filtro `gte hoje` no count do badge.
