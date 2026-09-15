# Corrigir a turma do lead no momento da atribuição

## Situação atual
Na tela "Aguardando atribuição", a lista de closers de cada reunião é filtrada pela marcação do lead: se veio como desqualificado, só aparecem closers da Turma B; se veio como qualificado, só da Turma A. O gestor não tem como corrigir essa marcação ali — precisa aceitar o que o SDR (ou o SDR de IA) mandou.

## O que muda

### 1. Seletor de turma em cada reunião
Ao lado do campo de closer, um seletor com duas opções: **Turma A (qualificado)** e **Turma B (desqualificado)**, já marcado conforme a reunião veio.

- Trocar a turma reclassifica o lead naquele momento e a lista de closers passa a mostrar os closers daquela turma.
- Se já houver um closer selecionado da turma antiga, a seleção é limpa para evitar combinação inválida.

### 2. Gravação junto com a atribuição
Quando o gestor clica em **Atribuir**, além do closer e do link do Meet, é gravada também a marcação de turma escolhida. As validações atuais continuam iguais: agenda bloqueada, limite de reuniões por horário e geração do Meet.

### 3. Rastreabilidade
Se a turma foi alterada em relação ao que o SDR enviou, isso é registrado no histórico de atividades (quem mudou, de qual turma para qual, e qual reunião), e a tela mostra um aviso discreto no card indicando a reclassificação.

### 4. Contexto para a decisão
O briefing já aparece no card; ele passa a ficar sempre visível (sem depender de rolagem em textos longos) e a marcação de "Lead desqualificado" no topo do card acompanha a escolha atual, não apenas a original.

## O que NÃO muda
- Regra de negócio de compatibilidade: reunião de lead desqualificado continua só com closer da Turma B e qualificado só com Turma A — o gestor corrige a classificação, não burla a regra.
- Nenhuma alteração nas APIs do SDR de IA, na disponibilidade, nos tetos por horário, no calendário, em métricas ou em mensagens ao lead.
- Nada é reenviado para leads por causa dessa mudança.

## Detalhes técnicos
- Arquivo: `src/pages/AguardandoAtribuicaoPage.tsx` (somente frontend, sem migração).
- Novo estado local `turmaOverride: Record<string, boolean>` (id da reunião → `lead_desqualificado` efetivo), inicializado a partir de `a.lead_desqualificado`.
- `closerOptions` passa a filtrar por `Boolean(c.em_treinamento) === desqEfetivo`.
- `handleAssign` inclui `lead_desqualificado: desqEfetivo` no `update` de `agendamentos` (o trigger de UPDATE já alinha marcação e closer, então não há conflito).
- Auditoria via `logAudit("reclassificar_turma_lead", "agendamento", a.id, { de, para })` de `src/services/auditLog.ts`, disparada só quando `desqEfetivo !== a.lead_desqualificado`.
- Componente de seletor: `ToggleGroup` (`@/components/ui/toggle-group`), no mesmo padrão visual já usado na página de Usuários do Admin (Turma A em `primary`, Turma B em âmbar).
