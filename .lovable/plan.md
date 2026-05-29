## Objetivo

Adicionar um ícone de download no cabeçalho do card **"Motivos de Não Fechamento"** (em `src/components/dashboard/VendasTab.tsx`) que exporta um arquivo `.csv` com os leads que estão computados na seção, respeitando os filtros ativos (período do dashboard + filtro de closer do próprio card).

## Onde alterar

Arquivo único: `src/components/dashboard/VendasTab.tsx`

## Mudanças

1. **Importar** o ícone `Download` do `lucide-react` e helpers `formatBRDateTime` / `formatBRDate` de `@/lib/timezone`.

2. **Estender a query `vendas-tab`** incluindo no select os campos necessários ao CSV:
   - `vendas.explicacao_nao_fechamento`, `vendas.resumo_venda`
   - `agendamentos.lead_phone, channel_type, scheduled_time, created_at, sdr_responsavel_id, created_by, briefing`
   - Atualizar as interfaces `VendaRow` e `AgendamentoRow`.

3. **Nova query** `vendas-tab-profiles` que chama a RPC `get_public_profiles()` para mapear `user_id → full_name` (resolver nome do SDR).

4. **Botão de download** no header do card, ao lado do `Select` de closer:
   - `Button` ghost com ícone `Download`, `aria-label="Baixar CSV"`.
   - Desabilitado quando `naoFechouRows.length === 0`.

5. **Handler `handleDownloadCsv`**:
   - Filtra `vendasDiaParaMotivos` por `!v.vendeu` (mesma base que alimenta o card).
   - Para cada linha, monta as colunas:
     - Nome do lead, Telefone, Data agendamento (dd/MM/yyyy), Hora, Closer, SDR, Canal, Data de criação, Status da reunião, Motivo do não fechamento, Explicação do porquê não fechou, Resumo do cliente, Observações.
   - Escapa valores com `"` e quebras de linha (CSV padrão: aspas duplas, duplicação de `"` interno, separador `;` para abrir bem no Excel pt-BR, BOM UTF-8 `\uFEFF` no início).
   - Cria um `Blob`, gera URL com `URL.createObjectURL` e dispara download via `<a>` com nome `motivos-nao-fechamento_{periodo}_{closer}.csv`.

## Detalhes técnicos

- **SDR**: usar `sdr_responsavel_id ?? created_by` e resolver via profilesMap.
- **Closer**: usar `closerMap` (já existe).
- **Data do agendamento**: `scheduled_date` (já está em yyyy-MM-dd, converter para dd/MM/yyyy).
- **Data de criação**: `agendamentos.created_at` formatado com `formatBRDateTime`.
- **Sem dependências novas**: usar apenas APIs do navegador (`Blob`, `URL.createObjectURL`).

## Fora de escopo

- Não alterar layout/estilos do restante do dashboard.
- Não mexer em RLS, edge functions ou schema do banco.
