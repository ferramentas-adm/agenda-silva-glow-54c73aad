# Prompt para replicar a aba "Administração > Envio em lote"

Copie o texto abaixo e cole no chat do outro projeto. Ele descreve a tela inteira: URL de importação, período, pré-visualização com busca e seleção, envio em blocos com progresso e reenvio de falhas, payload de teste, e o cartão de envio automático diário com histórico.

---

## PROMPT (colar no outro projeto)

Implemente uma nova aba **"Envio em lote"** na página **Administração**, visível apenas para Gestor/Admin, que faz a carga (backfill) das vendas fechadas para o CRM. Siga exatamente o comportamento abaixo. Não altere o webhook de venda em tempo real que já existe: o lote usa uma URL de importação separada.

### 1. Configuração da URL

- Cartão "URL de importação do CRM" com um campo de texto e botão "Salvar".
- O valor é guardado em `app_settings` na chave `datacrazy_bulk_import_url` (insert quando não existir, update quando existir). Se o projeto usa outro nome de tabela de configurações, use a equivalente.
- Validação no backend: precisa começar com `http://` ou `https://`, senão o envio é bloqueado com mensagem "Configure a URL de importação antes de enviar".

### 2. Período e pré-visualização

- Cartão "Período do lote" com dois campos de data (De / Até), padrão = primeiro e último dia do mês corrente em **America/Sao_Paulo**.
- Botão "Pré-visualizar" chama a edge function com `{ action: "preview", from, to }` e devolve `{ total, items }`.
- Escopo do lote: apenas vendas com `vendeu = true`; agendamentos com soft delete (`deleted_at`) ficam fora; a venda é atribuída pela **data de fechamento** (`closed_at`, com fallback para `created_at` convertido para BRT).
- Cada item da lista traz: `venda_id`, `lead_name`, `lead_phone`, `closer_name`, `sdr_name`, `valor`, `closing_date`, ordenados por data de fechamento.
- Botão "Payload de teste" chama `{ action: "sample", from, to }` (ou `{ action: "sample", ids: [primeiro selecionado] }`) e mostra o JSON formatado em um bloco `<pre>` com botões "Copiar" e "Fechar". Nada é enviado.

### 3. Lista com busca e seleção

- Cabeçalho do cartão: "N vendas no lote", "Total coletado: R$ X" e, quando houver seleção, "N selecionadas · R$ Y".
- Campo de busca que filtra por nome do lead, closer ou SDR (comparação sem acento e case-insensitive) e por telefone (somente dígitos, a partir de 3 dígitos digitados).
- Tabela com colunas: caixa de seleção, Lead, Telefone, Closer, SDR, Valor (alinhado à direita, formato BRL), Fechamento (dd/mm/aaaa). Cabeçalho fixo (`sticky`), área com rolagem (`max-h-96`).
- Caixa no cabeçalho seleciona/desmarca **todos os itens filtrados**, com estado indeterminado quando parcialmente marcado. Clicar na linha também alterna a seleção.
- Linha selecionada recebe destaque leve de fundo; linha que falhou no envio recebe um selo "falha".

### 4. Ações de envio

- "Enviar selecionadas (N)" — envia apenas o que está marcado; desabilitado sem seleção.
- "Enviar lote" — envia o período inteiro.
- "Enviar 1 teste" — envia apenas a primeira venda selecionada (ou a primeira da lista).
- "Limpar seleção" e "Reenviar falhas (N)".
- O frontend fatia os IDs em blocos de **25** e chama `{ action: "send", ids: bloco }` em sequência, atualizando barra de progresso e o contador "N enviadas · N falhas". O backend rejeita blocos com mais de 40 IDs.
- Lista de falhas (até 20 visíveis) mostrando nome do lead, código de status e mensagem de erro.
- Após cada envio: as vendas que falharam permanecem selecionadas, as enviadas com sucesso são desmarcadas.
- Ao recarregar a pré-visualização, seleção, busca, progresso e falhas são zerados.
- Toast de sucesso ("N vendas enviadas ao CRM") ou de aviso ("N enviadas, N com falha").
- Registrar em auditoria a ação `crm_bulk_vendas` com período, total, enviados e falhas.

### 5. Edge function `crm-bulk-vendas`

Exige sessão autenticada e papel gestor/moderador/supervisor (checagem via tabela de papéis com a chave de serviço). CORS liberado com `OPTIONS`. Ações:

- `preview` → lista do período (descrito acima).
- `sample` → monta o payload de uma venda e devolve sem enviar.
- `send` → para cada venda: monta o payload, faz `POST` na URL de importação com `Content-Type: application/json`, timeout de **15 s** por item, **2 tentativas** (500 ms entre elas) e **150 ms** de intervalo entre itens; devolve `{ sent, failed, results }` com `{ venda_id, ok, status, error }` por item. Vendas cujo agendamento foi excluído retornam erro `agendamento_excluido`.

O payload deve ser **idêntico ao webhook de resultado de venda já usado no projeto**, com dois campos extras para o CRM distinguir a carga: `event: "venda_resultado_lote"` e `backfill: true`. Além dos dados da venda e do agendamento (lead, telefone, closer, SDR, valor, valor total do projeto, resumo, origem da venda, order bumps, follow-up, observações, canal, motivo da reunião), inclua `outcome: "fechou"`, `status: "Vendido"`, `is_vendeu: true`, `scheduled_datetime`, `closing_date`, `registered_at` e `timestamp`. Nenhuma tabela é alterada — o lote é somente leitura.

### 6. Cartão "Envio automático diário" (dentro da mesma aba)

- Edge function `crm-daily-vendas` disparada por `pg_cron` às **00:00 BRT (03:00 UTC)**, autenticada por header `x-cron-secret` (segredo do ambiente ou token guardado em configurações), enviando as vendas fechadas do dia anterior para a **mesma URL de importação**.
- Sem duplicidade: por padrão só envia vendas ainda não confirmadas; trava de concorrência por *lease* (não roda dois envios ao mesmo tempo, retorna `already_running`).
- Tabelas de histórico:
  - `crm_daily_runs`: `id`, `run_date`, `kind` (`auto`/`manual`), `status` (`running`/`success`/`partial`/`failed`), `total`, `sent`, `failed`, `skipped`, `forced`, `started_at`, `finished_at`, `lease_until`, `triggered_by_name`, `error`.
  - `crm_daily_run_items`: `id`, `run_id`, `venda_id`, `lead_name`, `lead_phone`, `closer_name`, `valor`, `ok`, `status_code`, `error`, `attempts`, `sent_at`.
  - Ambas com RLS: leitura para gestor/moderador/supervisor; escrita apenas pela função (chave de serviço). Inclua os `GRANT` necessários.
- Interface do cartão: campo de data (padrão = ontem em BRT), botão "Enviar vendas do dia", alternador "Reenviar tudo: ligado/desligado", barra de progresso da execução em andamento (atualização a cada 3 s) e histórico das últimas 30 execuções — cada linha expansível mostra data, selo de status, tipo, contadores, quem disparou e a lista de itens com erros, falhas primeiro.

### 7. Detalhes técnicos e cuidados

- Datas sempre em **America/Sao_Paulo**; nunca use o fuso do navegador para derivar dia.
- Use os componentes de UI e tokens do projeto (nada de cores fixas), `sonner` para toasts e `@tanstack/react-query` para carregar/invalidar a URL e o histórico.
- Adicione a aba ao conjunto de abas da Administração apenas na visão de Gestor/Admin.
- Reaproveite a função existente que monta o payload de venda, para o lote e o webhook diário não divergirem do envio em tempo real.
