## 1. Remover a aba "Tendências"

- Em `src/pages/DashboardComercialPage.tsx`: remover o `TabsTrigger` e `TabsContent` de Tendências, e o import do `TendenciasTab`.
- Deletar `src/components/dashboard/TendenciasTab.tsx`.
- Deletar Edge Function `supabase/functions/dashboard-ai-chat/` e remover entrada no `supabase/config.toml` (se houver).
- Manter a tabela `ai_chat_messages` (migração já aplicada — drop via nova migração opcional; pergunto abaixo).
- Remover dependências instaladas só pro chat se não usadas em outro lugar (`ai`, `react-markdown`, AI Elements). Confirmo antes de remover.

## 2. Análise de Junho (resposta direta no chat, sem código)

Dados reais de Junho/2026 por semana (scheduled_date, BRT):

| Semana | Agend | Realiz | Vendas | Conv | Ticket | Faturamento | Follow-ups | No-show% |
|---|---|---|---|---|---|---|---|---|
| 01–07/jun | 380 | 222 | 18 | 8,1% | R$ 12.667 | R$ 228k | 47 | 18,4% |
| 08–14/jun | 545 | 318 | 38 | 11,9% | R$ 10.461 | R$ 397k | 112 | 24,4% |
| 15–19/jun (parcial) | 556 | 315 | **19** | **6,0%** | **R$ 5.232** | **R$ 99k** | **160** | 16,9% |

**Sim, estamos piorando — e forte — na semana atual:**

1. **Conversão despencou**: 11,9% → **6,0%** (metade da semana anterior).
2. **Ticket médio colapsou**: R$ 10,4k → **R$ 5,2k** (-50%). Mix de produto barato ou desconto agressivo.
3. **Follow-ups explodindo**: 47 → 112 → **160**. Closers empurrando decisão em vez de fechar.
4. **Faturamento**: R$ 397k → R$ 99k (semana ainda em curso, mas ritmo bem abaixo).
5. **No-show melhorou** (24,4 → 16,9%) — único ponto positivo.

**Diagnóstico**: o problema da semana 15–19 não é volume (agendamentos seguem altos), é **fechamento**. Ticket caindo + follow-ups subindo = closers cedendo demais ou qualificação fraca chegando na call.

## Perguntas

1. Mantenho a tabela `ai_chat_messages` no banco ou dropo via migração?
2. Quer que eu mantenha algum gráfico simples (ex.: linha de conversão semanal) em algum lugar do dashboard, ou remoção total?
