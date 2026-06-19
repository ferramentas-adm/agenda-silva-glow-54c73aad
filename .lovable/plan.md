## Aba "Tendências" com Chat IA

### 1. Nova aba no Dashboard Comercial
Adicionar `TendenciasTab` em `DashboardComercialPage` (junto com Vendas, Carga, etc.).

**Painel superior — comparativo mês atual vs anterior (mesmo período do mês):**
- Agendamentos, realizadas, vendas, conversão %, ticket médio, faturamento, no-show %, cancelamento %, follow-ups abertos, call interrompida.
- Cada métrica mostra valor atual + delta (↑/↓ com cor) vs mesmo dia do mês passado.
- Cards com destaque automático ("⚠ Alerta") quando: ticket cai >15%, conversão cai >2pp, follow-ups crescem >50%, no-show >22%.

**Painel "Padrões detectados":**
- Top closers em queda de conversão (jun vs mai).
- Motivos de não-fechamento que mais cresceram.
- Tendência semanal (mini-gráfico) de conversão e ticket.

Dados via queries Supabase no front (mesmo padrão do `VendasTab`).

### 2. Chat IA lateral/embaixo
Chat embutido na própria aba (lado direito em desktop, embaixo em mobile) onde o gestor conversa sobre os dados.

**Decisões de UX (proposta — confirmar):**
- **Forma:** uma conversa só por usuário (sem threads). Simples e foco em análise contínua.
- **Persistência:** banco (tabela `ai_chat_messages` com RLS por `auth.uid()`), para o gestor retomar de outro dispositivo.

**Arquitetura técnica:**
- Edge Function `dashboard-ai-chat` usando **AI SDK + Lovable AI Gateway** (modelo padrão `google/gemini-3-flash-preview`).
- Streaming via `streamText` + `toUIMessageStreamResponse`.
- **Tools** que a IA pode chamar (tudo read-only, escopadas por permissão):
  - `query_agendamentos(period, filters)` — agrega status/conversão/ticket por período/closer/canal.
  - `query_vendas(period, filters)` — vendas, valores, motivos de não-fechamento, produtos.
  - `query_followups(period)` — follow-ups abertos/atrasados.
  - `compare_periods(metric, periodA, periodB)` — comparativo direto.
  - `top_closers(period, metric)` — ranking.
- System prompt com contexto: schema resumido, regras de negócio (ex.: "Call Interrompida fica fora da base de conversão"), papel do usuário, timezone BRT.
- Verificação de role (gestor/moderador) antes de responder — SDR/Closer não acessam.

**UI:**
- Componentes AI Elements (`Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Tool` colapsado).
- Markdown renderizado (tabelas, listas).
- Sugestões iniciais clicáveis: "Por que o ticket caiu este mês?", "Quais closers regrediram?", "Resuma o mês até agora", "Tendências negativas escondidas".

### 3. Banco
Migration:
- `ai_chat_messages` (id, user_id, role, content jsonb, created_at) + RLS `auth.uid() = user_id` + GRANTs.
- Sem tabela de threads (conversa única por usuário).

### 4. Detalhes técnicos
- Reaproveitar helpers de timezone (`src/lib/timezone.ts`) em todas as queries de período.
- Tools rodam dentro da Edge Function com `service_role` (chamadas escopadas — nunca expõem dados de outro tenant; este projeto é single-tenant).
- `stopWhen: stepCountIs(50)` para loops de tools.
- Tratar 429/402 do gateway com toast claro.

```text
DashboardComercialPage
├── Tabs
│   ├── Vendas (existe)
│   ├── Carga (existe)
│   └── Tendências  ← NOVO
│       ├── ComparativoCards (mês atual vs anterior, alertas)
│       ├── PadroesDetectados (closers em queda, motivos, semanal)
│       └── ChatPanel
│           └── PromptInput → /functions/v1/dashboard-ai-chat (stream)
│                              ├── tools: query_*, compare_*, top_*
│                              └── persiste em ai_chat_messages
```

### Perguntas antes de implementar
1. **Conversa única** por usuário ou **múltiplas threads** (tipo ChatGPT, com histórico lateral)?
2. **Persistir no banco** (retoma em qualquer dispositivo) ou **só localStorage** (mais simples, por navegador)?
3. **Acesso ao chat:** só gestor/moderador, ou também SDR/Closer veem (com dados restritos ao próprio escopo)?