# Reverter o teto de leads para o valor antigo

Voltar o limite de leads buscados no DataCrazy de **1000 para 5000** (valor original), mantendo o restante das otimizações (cache de 5min, paginação paralela, prefetch no login).

## Mudança

Arquivo: `src/services/datacrazy.ts`, função `buscarLeadsComTagId`

```diff
- const MAX_LEADS = 1000; // teto realista (10 páginas)
+ const MAX_LEADS = 5000; // teto antigo — traz todos os leads com a tag
```

## Impacto

- **Comportamento:** todos os leads com a tag "agendamento" voltam a aparecer (até 5000, mesmo limite de antes).
- **Performance:** a paginação paralela (lotes de 5) continua válida — a 1ª carga fica um pouco mais lenta que o teto de 1000, mas ainda bem mais rápida que o modelo original sequencial. Cache de 5min segue ativo, então re-visitas continuam instantâneas.

Sem outras alterações.
