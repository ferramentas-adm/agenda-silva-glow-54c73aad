# Toggle "Só meus agendamentos" para SDR no Calendário

## Objetivo
Hoje o filtro por SDR no Calendário (rota `/`) só aparece para gestor/moderador/supervisor. O SDR não tem como isolar rapidamente as próprias agendas, o que dificulta acompanhar os leads antes da reunião.

## O que será feito
- Adicionar, na barra de filtros do Calendário, um toggle visível apenas para usuários com função SDR: **"Só meus agendamentos"**.
- Ligado: o calendário mostra apenas as agendas em que o SDR é o responsável (campo de SDR responsável ou, na falta dele, o criador).
- Desligado: comportamento atual (vê o que a permissão dele já permite).
- Estado padrão: ligado, para o SDR cair direto na visão dos próprios leads. A escolha fica salva no navegador para não precisar reativar a cada acesso.
- Contador ao lado do toggle indicando quantas agendas estão sendo exibidas, no mesmo padrão visual já usado no filtro de SDR dos gestores.
- O filtro existente de SDR (dropdown) segue exclusivo para gestor/moderador/supervisor, sem mudanças.

## Detalhes técnicos
- Arquivo: `src/pages/DashboardPage.tsx`.
- Reaproveitar a lógica de dono do agendamento já usada em `filtered` (`sdr_responsavel_id` com fallback para `created_by` quando o criador tem papel SDR), aplicando `ownerSdr === user.id` quando o toggle está ativo e `role === "sdr"`.
- Novo estado `onlyMySdr` (persistido em `localStorage`), incluído nas dependências do `useMemo` de `filtered`.
- Componente `Switch` + `Label` do design system, renderizado somente quando `role === "sdr"`. Sem alteração de RLS, queries ou backend — filtro puramente de apresentação.
