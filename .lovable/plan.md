## 1. Limite de 2 reuniões/horário por Closer

Validação no `handleAssign` da `AguardandoAtribuicaoPage`:
- Antes de atribuir, contar agendamentos do Closer escolhido no mesmo `scheduled_date` + `scheduled_time` (ativos, `deleted_at IS NULL`, status ≠ `cancelada`).
- Se ≥ 2 → toast de erro bloqueando ("Esse Closer já tem 2 reuniões nesse horário"). Sem override.
- Aplicar somente nessa tela (atribuição manual do gestor), como solicitado.

## 2. Análise IA do lead (nota + justificativa) + sugestão de Closer

**UX:** botão "Analisar com IA" em cada card da tela Aguardando Atribuição. Resultado aparece inline no card (nota 0-100, badge de qualidade, parágrafo curto explicando o porquê, e sugestão de Closer com motivo). Cache em React Query por `agendamento.id` durante a sessão pra não regerar a cada render.

**Backend:** nova edge function `analisar-lead-ia` (`supabase/functions/analisar-lead-ia/index.ts`) que recebe `{ agendamento_id }` e:

1. Carrega dados do lead/agendamento: `lead_name`, `lead_phone`, `briefing`, `observation`, `channel_type`, `meeting_reason`, `sdr_responsavel_id`.
2. Consulta DataCrazy (reaproveitando `datacrazy-proxy`) pra buscar tags, faturamento, segmento, origem e observações do lead pelo telefone normalizado.
3. Monta **contexto histórico** a partir do banco:
   - Histórico do próprio lead (telefone): agendamentos anteriores, no-shows, reagendamentos.
   - Padrão de vendas fechadas (últimos 90 dias): `vendas` join `agendamentos` onde `vendeu = true` — extrai perfis (faturamento médio, segmentos, origens, tags mais comuns).
   - Por Closer ativo (excluindo Amanda Padilha): taxa de conversão geral (vendas/realizadas), ticket médio, perfil de leads que mais converte (faturamento/segmento dominante), no-show rate, carga atual no dia do agendamento.
4. Chama Lovable AI (`google/gemini-3-flash-preview`) com `Output.object` (zod) retornando:
   ```ts
   {
     score: number,           // 0-100
     qualidade: "alta"|"media"|"baixa",
     justificativa: string,   // pt-BR, 2-4 frases
     pontos_fortes: string[],
     pontos_atencao: string[],
     closer_sugerido: { id: string, nome: string, motivo: string } | null
   }
   ```
   Sistema prompt em pt-BR explicando regras e que match deve combinar perfil do lead + histórico do Closer + disponibilidade.

**Frontend:** novo componente `LeadAIAnalysis.tsx` consumindo a edge function via `useMutation`. Mostra loading, nota colorida (verde/amarelo/vermelho), justificativa, e botão "Usar [Closer sugerido]" que pré-seleciona no `<Select>` existente.

## 3. Arquivos afetados

- `src/pages/AguardandoAtribuicaoPage.tsx` — validação 2/horário; integração do componente de análise; preencher Select via sugestão.
- `src/components/aguardando/LeadAIAnalysis.tsx` (novo) — UI da análise.
- `supabase/functions/analisar-lead-ia/index.ts` (novo) — coleta contexto + chamada Lovable AI.
- `supabase/config.toml` — registrar a função (verify_jwt = true).

## 4. Pontos técnicos

- LOVABLE_API_KEY já existe no projeto.
- Tratar erros 429/402 da Lovable AI com toast claro.
- Limitar contexto enviado ao modelo (top 20 vendas recentes + resumo agregado por Closer) pra controlar custo/latência.
- Não persiste a análise (on-demand, conforme escolha do usuário). Cache em React Query (`staleTime: 10min`).
- Sem mudanças de schema, sem migração.

## 5. Fora de escopo

- Limite em outros fluxos (SDR agendando, edição) — mantido como hoje.
- Persistir score no banco.
- Retreinar/aprender automaticamente.