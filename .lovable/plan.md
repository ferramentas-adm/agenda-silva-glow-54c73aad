## Objetivo

Transformar a aba "Erros SDR" numa triagem com duas decisões claras, permitir reabrir um erro já revisado e abrir os detalhes completos do lead (briefing do SDR + dados do Closer) direto da tela.

## Renomeações sugeridas

- **Novos erros** → "Pendentes de revisão"
- **Revisados** → some como aba única; passa a virar **duas seções/abas**:
  - **Erros confirmados** (gestor validou que foi erro do SDR)
  - **Qualificados corretamente** (gestor concluiu que o SDR acertou — não era erro)

Layout final da página de Erros SDR: três abas
`Pendentes` · `Erros confirmados` · `Qualificados corretamente`

## Mudanças no banco

Adicionar coluna em `agendamentos` e `vendas`:

- `sdr_error_outcome TEXT` com valores possíveis: `confirmed` (erro do SDR confirmado) e `dismissed` (SDR acertou).
- Mantém `sdr_error_reviewed_at` e `sdr_error_reviewed_by` já existentes para registrar quem revisou.

Reabrir um item = setar os três campos como `NULL` (volta para Pendentes).

## Mudanças na UI — `ErrosSDRTab.tsx`

1. **Três abas** com contagem em badge, agrupadas por SDR em acordeão (mantém o padrão atual).
2. **Aba Pendentes** — cada item ganha **dois botões** (apenas para `gestor`/`moderador`):
   - `Validar erro` (vermelho/âmbar, ícone Check) → grava `outcome = confirmed`.
   - `SDR acertou` (verde, ícone ShieldCheck) → grava `outcome = dismissed`.
3. **Abas Erros confirmados / Qualificados corretamente** — cada item ganha um botão `Reabrir` (ícone Undo2) que limpa a revisão e devolve para Pendentes. Mostra também "Revisado por X em dd/MM".
4. **Clique no nome do lead** abre um **drawer de detalhes** com duas seções:
   - **Briefing do SDR** (pré-call) — reusa os campos já mostrados pelo `BriefingDrawer` existente quando aplicável.
   - **Resultado do Closer** (pós-call) — dados da venda quando existir (origem, status, valor, motivos, observações).
   
   Disponível em todas as três abas.

5. Cards de resumo no topo passam a mostrar 4 números: Pendentes · Confirmados · Qualificados corretamente · SDRs com erros.

## Permissões

- Validar / Marcar SDR acertou / Reabrir: somente `gestor` e `moderador` (mesma regra já existente).
- Visualização do drawer de detalhes: todos os papéis que já acessam a aba.

## Arquivos afetados

- `supabase/migrations/<new>.sql` — adicionar coluna `sdr_error_outcome` nas duas tabelas.
- `src/components/dashboard/ErrosSDRTab.tsx` — três abas, dois botões de decisão, botão reabrir, integração com novo drawer.
- `src/components/dashboard/SDRErrorDetailsDrawer.tsx` (novo) — drawer com briefing + dados do closer, busca os dados do `agendamento` e da `venda` por id.
- `src/integrations/supabase/types.ts` — regenerado após migration.

## Fora de escopo

- Não vou alterar `BriefingDrawer` nem `VendaDialog` existentes; o novo drawer só lê os dados em modo somente-leitura.
- Sem mudanças em RLS/edge functions; as colunas novas seguem as policies já existentes das tabelas.
