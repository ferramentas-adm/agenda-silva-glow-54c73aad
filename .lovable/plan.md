# Separar qualificados e desqualificados no desempenho dos SDRs

## Objetivo
Mostrar a performance real do time de pré-vendas nas abas **Ranking SDRs** e **Produtividade SDR**, permitindo analisar separadamente:

- **Todos** — qualificados e desqualificados juntos;
- **Qualificados** — reuniões com `lead_desqualificado = false`;
- **Desqualificados** — reuniões com `lead_desqualificado = true`.

Nessas duas abas, todos os desqualificados serão considerados, mesmo que não tenham comprado. A regra atual que só inclui desqualificado após venda continuará intacta nas demais áreas do Dashboard Comercial.

## Alterações na tela

### Ranking SDRs
- Adicionar um seletor compacto **Todos / Qualificados / Desqualificados** próximo aos filtros existentes.
- Aplicar a seleção às métricas **Criadas**, **Para** e **Compareceu**.
- Aplicar o mesmo recorte às colunas opcionais de realizadas e taxa de comparecimento.
- Recalcular total, média diária e posição do ranking usando somente o grupo selecionado.
- Manter o filtro por equipe SDR e o período global funcionando em conjunto com o novo filtro.

### Produtividade SDR
- Adicionar o mesmo seletor **Todos / Qualificados / Desqualificados** no topo da aba.
- Aplicar o recorte aos indicadores **Criadas**, **Para**, **Compareceu** e **Não compareceu**.
- Atualizar gráfico por dia/SDR, taxas, médias, turnos, detalhamentos e produtividade por hora conforme a seleção.
- Manter os filtros de equipe, SDR individual, período e tipo de métrica combináveis com o novo filtro.
- Nos painéis auxiliares da aba que usam consultas próprias, propagar a classificação para que não misturem os dois grupos quando um recorte estiver ativo.

## Regra dos dados
- A classificação usada será a registrada no próprio agendamento.
- Registros antigos entram automaticamente conforme sua marcação atual.
- O modo **Todos** representa a soma dos dois grupos, sem duplicidade.
- Reagendamentos, datas, status e atribuição ao SDR continuam seguindo as regras atuais de cada indicador.
- A mudança não altera o cadastro do lead, a turma do closer, vendas, agendamentos ou dados históricos; altera apenas a leitura analítica dessas duas abas.

## Detalhes técnicos
- Entregar às duas abas os conjuntos completos de agendamentos, antes do filtro comercial `contaNaMetrica`.
- Criar um tipo compartilhado de recorte (`all | qualified | disqualified`) e um predicado único baseado em `lead_desqualificado`.
- Incluir `lead_desqualificado` no contrato de dados da aba Produtividade SDR.
- Filtrar numeradores e denominadores pelo mesmo grupo para evitar taxas distorcidas.
- Adaptar componentes auxiliares da Produtividade SDR que hoje recebem dados ou consultam métricas sem a classificação.
- Preservar America/Sao_Paulo, filtros globais, regras de SDR efetivo e comportamento dos detalhamentos.

## Validação
- Conferir que **Todos = Qualificados + Desqualificados** para cada indicador e SDR no mesmo período.
- Conferir que a taxa de comparecimento de cada grupo usa apenas reuniões daquele grupo no denominador.
- Testar dia único, intervalo, equipe, SDR individual e os quatro tipos de métrica.
- Verificar desktop e celular, sem perda de legibilidade na tabela e nos gráficos.
