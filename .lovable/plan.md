# Fase 5 — Itens deferidos M1, M2, M4, M9

Trabalho de maior escopo em 4 frentes independentes. Ordem sugerida do menor risco ao maior:

---

## M9 — `AdminPage.tsx`: reduzir payload de `select("*")`

**Onde:** `src/pages/AdminPage.tsx` linhas 190–192 e 1127.

**O que fazer:**
- Substituir `profiles.select("*")` por lista explícita de colunas usadas: `id, user_id, full_name, email, active, available_for_scheduling, is_sdr_override, moderador_tipo, sdr_team, datacrazy_id`.
- Substituir `user_roles.select("*")` por `user_id, role`.
- Substituir `closers.select("*")` por `id, name, email, active, business_hours_start, business_hours_end, business_hours_ranges, datacrazy_id`.
- Substituir `app_settings.select("*")` (linha 1127) por `key, value` (colunas realmente consumidas).

**Impacto:** reduz tráfego em ~40–60% na tela Admin, sem alterar UI.

---

## M4 — Virtualização de listas longas

**Dependência nova:** `@tanstack/react-virtual`.

**Alvos (listas que renderizam >100 itens em DOM):**
1. `ReunioesListPage.tsx` — lista principal de reuniões.
2. `AuditLogsPage.tsx` — tabela de auditoria (já paginada, mas render pode ter 100+/página).
3. `AguardandoAtribuicaoPage.tsx` — quando há muitas pendentes.

**Estratégia:** wrapper com `useVirtualizer` mantendo o markup atual do card em `estimateSize` ~180px. Só ativa quando `items.length > 30` (fallback para render normal em listas curtas, preservando testes).

---

## M2 — `AguardandoAtribuicaoPage` + análise IA server-side com cache

**Problema atual:** cada linha dispara `LeadAIAnalysis` cliente-side; `useQuery` sem paginação; N chamadas paralelas de IA por render.

**O que fazer:**
1. **Paginação:** adicionar `range()` (25 por página) com botões "Anterior/Próximo". Query mantém `refetchInterval: 30_000`.
2. **Cache de IA em tabela:**

```text
CREATE TABLE public.lead_ai_analysis (
  agendamento_id uuid PK REFERENCES agendamentos ON DELETE CASCADE,
  analysis jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- GRANT SELECT para authenticated; RLS: quem enxerga o agendamento enxerga a análise
```

3. **Edge function `analisar-lead-ia`** já existe: alterar para:
   - Verificar cache antes de chamar o modelo (TTL 24h);
   - Persistir resultado após inferência;
   - Aceitar chamada em batch `agendamento_ids: string[]` retornando `{ id: analysis }`.
4. **Front:** substituir N invocações independentes por 1 chamada em batch por página exibida; renderizar do cache local.

**Impacto:** custo de IA cai drasticamente; render deixa de disparar N requests.

---

## M1 — Quebrar `DashboardPage.tsx` (2.381 linhas, 79 hooks)

**Estratégia sem regressões:**

1. **Extrair seções em componentes memoizados** (mesmo arquivo → arquivos irmãos em `src/components/dashboard/sections/`):
   - `HeaderFilters` (filtros de período/closer/canal)
   - `KpiCards` (grid de cards de topo)
   - `TrendCharts` (envolve os `TrendCard*` já existentes)
   - `TabsPanel` (wrapper dos Tabs — Vendas/SDR/Erros/Carga)

2. **Cada seção**: `React.memo` + props explícitas (`period`, `closerId`, `canal`, …). Os hooks pesados descem para a seção que realmente usa o dado (elimina re-render em cascata pelo state do topo).

3. **Estado compartilhado**: manter `useState` no Dashboard só para filtros; migrar dados derivados para hooks locais das seções.

4. **Nenhuma mudança visual** — apenas topologia de componentes.

**Risco:** médio. Mitigação: extrair uma seção por vez, checar typecheck + preview após cada uma.

---

## Ordem de execução proposta

1. **M9** (30 min, zero risco) — select colunas específicas.
2. **M4** (1h) — instalar `@tanstack/react-virtual`, virtualizar `ReunioesListPage` primeiro.
3. **M2** (2h) — migration + edge function + paginação da tela.
4. **M1** (2–3h) — extração incremental das 4 seções do Dashboard.

## Aprovação necessária

Confirme:
- (a) Ordem acima ou prefere outra?
- (b) Instalar `@tanstack/react-virtual` (nova dependência)?
- (c) Criar tabela `lead_ai_analysis` para cache de IA?
- (d) Alterar edge function `analisar-lead-ia` para batch + cache?
