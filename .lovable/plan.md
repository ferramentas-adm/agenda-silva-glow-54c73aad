# Time do SDR: Tráfego / Social Selling

## Banco
- Migration: criar enum `sdr_team` (`trafego`, `social_selling`) e coluna `profiles.sdr_team sdr_team NULL`.
- Trigger `validate_sdr_team_required` em `profiles` (BEFORE INSERT/UPDATE): se o usuário é SDR (via `user_roles.role='sdr'`) OU `is_sdr_override=true`, exigir `sdr_team NOT NULL`. Bloqueia salvar sem time.
- `get_public_profiles()` passa a retornar também `sdr_team`.

## Admin (`src/pages/AdminPage.tsx`)
- Na linha de cada usuário elegível (SDR ou override), adicionar `Select` com opções **Tráfego** / **Social Selling**.
- Mutation grava `sdr_team` em `profiles`.
- Aviso visual "Time obrigatório" quando ainda não definido.

## Componente compartilhado
- Novo `src/components/sdr/SdrTeamBadge.tsx`: badge colorido (Tráfego = azul, Social Selling = roxo).
- Novo `src/components/sdr/SdrTeamFilter.tsx`: botões toggle **Todos | Tráfego | Social Selling** (usa `ToggleGroup`), estado controlado.
- Novo `src/hooks/useSdrTeams.ts`: retorna `Map<userId, sdr_team>` a partir de `get_public_profiles`.

## Ranking SDR (`RankingSDRsTab`)
- Renderizar `SdrTeamFilter` acima da tabela.
- Filtrar as linhas conforme time selecionado.
- Adicionar coluna/inline `SdrTeamBadge` ao lado do nome do SDR.

## Produtividade SDR (`ProdutividadeSDRTab`)
- Mesmo padrão: filtro no topo + badge no nome. Aplicar filtro tanto na tabela quanto nos totais/gráficos derivados dos SDRs listados.

## Erros SDR (`ErrosSDRTab` / abas dentro de `ErrosTab`)
- Filtro toggle no topo + badge no acordeão de cada SDR.
- Filtra os grupos exibidos.

## Fora de escopo
- Métricas SDRs (dashboard principal) e outras telas não recebem filtro/badge nesta rodada.
- Sem migração de dados: usuários existentes ficarão sem time até o admin definir (o trigger passa a exigir apenas em novos updates/inserts; **incluir** um passo de UPDATE inicial? Não — apenas alertar no Admin, evitando quebrar signup/handle_new_user).

## Detalhes técnicos
- Trigger ignora `handle_new_user` (que insere antes da role existir) usando `pg_trigger_depth()` ou condicionando à existência de role já persistida.
- `sdrOverrides.ts` continua fonte da verdade sobre "quem conta como SDR"; o filtro combina `role='sdr' OR is_sdr_override=true`.
- Tipos regenerados automaticamente após migration.
