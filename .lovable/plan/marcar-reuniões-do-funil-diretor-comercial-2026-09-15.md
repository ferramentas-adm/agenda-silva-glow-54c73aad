# Marcar reuniões do funil Diretor Comercial

## 1. Como a reunião é reconhecida como "Diretor"

Uma reunião é do funil Diretor quando:

- o nome do lead começa com `🔴 DIRETOR ·` (com ou sem emoji, sem depender de acento/maiúscula), ou
- o campo `funil` recebido em `POST /silva-agendar` é `diretor`.

O endpoint passa a aceitar `funil: "diretor"` (hoje aceita apenas `formulario` e `vsl-direta`) e registra essa marca junto às observações da reunião, do mesmo jeito que já registra o funil atual. Assim o app reconhece a reunião mesmo se o SDR parar de usar o prefixo no nome.

Sem mudança no banco: nenhuma coluna nova, nenhum dado histórico alterado.

Um único trecho de código compartilhado decide se a reunião é Diretor, para calendário e listagem nunca divergirem. Ele também devolve o nome do lead sem o prefixo, para o nome não aparecer duplicado ao lado da marca vermelha.

## 2. Marca vermelha "DIRETOR"

- **Calendário**: etiqueta vermelha compacta `DIR` no canto do bloco da reunião (mesmo padrão das etiquetas atuais MA / 2ª / B), com dica ao passar o mouse: "Funil Diretor Comercial — oferta R$10 mil".
- **Card aberto da reunião**: badge vermelha `DIRETOR` ao lado do nome do lead.
- **Listagem de reuniões**: badge vermelha `DIRETOR` junto das outras marcas da linha, e também no topo da janela de detalhes.

## 3. Filtro "Funil" no calendário

Novo seletor **Funil: Todos / Diretor / Padrão** ao lado do seletor de Turma já existente, no mesmo estilo visual. Filtra apenas o que aparece na tela; a escolha fica salva no navegador por usuário. Não altera contagens de disponibilidade, nem métricas, nem qualquer envio externo.

## 4. Briefing completo no card aberto

No card aberto da reunião, o briefing passa a aparecer direto na tela — texto integral, com as quebras de linha exatamente como o SDR escreveu — em vez de só um botão "Ver briefing". O botão continua existindo para editar/marcar como lido.

Para reunião do funil Diretor, esse bloco recebe destaque vermelho, para o closer não entrar na call sem ler o aviso da primeira linha (oferta R$10 mil com garantia de 30 dias, não R$5 mil + 10%).

## Detalhes técnicos

- Novo `src/lib/funilDiretor.ts`: `isDiretor(ag)` e `stripDiretorPrefix(name)`.
- Novo `src/components/calendar/FunilFilter.tsx` (espelha `TurmaFilter`).
- `useCloserFilter` ganha `funil` + `setFunil` persistidos em `localStorage` (`closer-funil-<userId>`); `DashboardPage` aplica o filtro na lista de agendamentos já carregada.
- `DashboardPage`: etiqueta no bloco do calendário, badge no `DialogTitle`, bloco de briefing inline com `whitespace-pre-wrap` + `linkifyText`.
- `ReunioesListPage`: badge na coluna de status e no cabeçalho do detalhe.
- `supabase/functions/silva-agendar/index.ts`: enum `funil` ganha `diretor`; nenhuma outra validação, capacidade, Meet, CAPI ou payload muda.

## Fora de escopo

Métricas, dashboards de vendas, `/silva-reunioes`, `/silva-vendas`, CAPI, lote diário DataCrazy e lembretes permanecem intactos.
