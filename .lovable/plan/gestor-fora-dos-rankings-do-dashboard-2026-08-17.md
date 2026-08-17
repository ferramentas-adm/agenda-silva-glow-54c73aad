# Gestor fora dos rankings do Dashboard

## O que está acontecendo

Verifiquei no banco: "Bruna Angélica" já está com função **Gestor** e com a marcação "Atua como SDR" **desligada**. Ainda assim ela aparece no Ranking SDRs porque existe uma lista fixa de nomes no código (`src/lib/sdrOverrides.ts`, com "Bruna Angélica" e "Lucas Emanuel") que força a inclusão nas listas de SDR, independente da função atual.

## Regra a implementar

Quem tem função **Gestor** nunca entra em nenhuma lista/ranking/métrica de SDR do Dashboard — mesmo que tenha override manual ou nome na lista fixa. A função Gestor passa a ter prioridade sobre qualquer override.

Além disso, ao mudar a função de um usuário para Gestor, a marcação "Atua como SDR" é limpa automaticamente.

## Mudanças

1. **Exclusão por função (frontend)**
   - Em `src/lib/sdrOverrides.ts`: nova checagem que só considera override se a função **não** for `gestor`.
   - Aplicar o filtro nos pontos que montam listas de SDR:
     - `src/pages/DashboardComercialPage.tsx` (Métricas SDRs, Ranking SDRs, Produtividade SDR, Erros SDR)
     - `src/pages/DashboardPage.tsx` (filtros de SDR do calendário)
     - `src/pages/ReunioesListPage.tsx` (filtro de SDR)
     - `src/pages/AgendarPage.tsx` (seletor de SDR responsável)
   - Em todos, a role vem do mapa de `user_roles` já carregado; onde não vier, incluir a role na consulta.

2. **Remover a dependência da lista fixa de nomes**
   - Remover "Bruna Angélica" da lista fixa (ela é Gestora agora). Manter o mecanismo por nome apenas como retrocompatibilidade, já subordinado à regra de função.

3. **Limpeza automática ao promover a Gestor**
   - `supabase/functions/manage-user/index.ts` (ação `change_role`): quando `new_role = "gestor"`, gravar `is_sdr_override = false` no perfil.
   - Trigger no banco para garantir a mesma regra em qualquer caminho de alteração de função (inclusive alterações diretas em `user_roles`): ao virar `gestor`, zera `is_sdr_override` do perfil.

## Resultado esperado

- Bruna Angélica desaparece de Ranking SDRs, Métricas SDRs, Produtividade SDR e Erros SDR.
- Agendamentos históricos dela continuam intactos (nada é apagado); ela apenas deixa de figurar como operadora nos rankings.
- Qualquer promoção futura a Gestor tem o mesmo efeito automaticamente.
