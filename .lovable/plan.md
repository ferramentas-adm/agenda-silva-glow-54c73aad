# Lupa de busca na Torre de Controle

## Objetivo
Adicionar uma pesquisa (lupa) no painel "Torre de Controle" para localizar rapidamente o status de uma reunião pelo **nome do lead**, **telefone do lead** ou **nome do closer** — dentro do horário exibido e, quando a busca não achar nada ali, em todas as reuniões do dia.

## Comportamento
- Novo campo de busca no topo do painel, com ícone de lupa, ao lado dos botões de hora/Atualizar.
- Texto de ajuda (placeholder + instrução): `Buscar por nome do lead, telefone ou closer`.
- Digitação filtra em tempo real (sem apertar Enter), ignorando maiúsculas/minúsculas e acentos.
- Telefone: o usuário pode digitar com ou sem DDI `55`, com ou sem máscara — a comparação usa apenas os dígitos.
- Enquanto houver texto de busca:
  - A lista mostra as reuniões que correspondem, de **qualquer hora do dia**, cada uma com o horário visível (ex.: 21:00) e o mesmo semáforo de presença (bolinha), closer, telefone, botões "Abrir no CRM" e "Abrir sala".
  - A contagem de bolinhas no topo passa a refletir apenas o resultado da busca.
  - Clicar em um resultado volta para a visão da hora daquela reunião e limpa a busca.
  - Se nada for encontrado: mensagem "Nenhuma reunião encontrada hoje para '...'".
- Sem texto de busca: tudo funciona exatamente como hoje (hora corrente/seguinte a partir de HH:55, atualização automática a cada 30s).

## Mudanças técnicas
- Arquivo único: `src/components/calendar/TorreControleDialog.tsx`.
  - Novo estado `busca`; filtro `useMemo` sobre as reuniões carregadas (nome do lead, dígitos do telefone, nome do closer — via `closers.name` já presente na query).
  - Nova query `torre-busca` (ativa só quando há texto): busca todas as reuniões de hoje com os mesmos filtros de status de hoje, para cobrir o dia inteiro; presença e CRM são reaproveitados pelos ids/telefones retornados.
  - Ícone `Search` (lucide) no input; badge com contagem de resultados.
- Nenhuma mudança de banco, RLS ou regra de agendamento. O carregamento extra só acontece enquanto o usuário digita.

## Teste
- Abrir a Torre, digitar parte do nome de um lead de outra hora → a reunião aparece com horário e bolinha correta; clicar nela volta para a hora dela.
- Digitar telefone sem DDI (ex.: `98348815`) e com DDI → encontra.
- Digitar nome do closer → mostra todas as reuniões dele no dia.
- Confirmar que sem busca o painel segue igual (mesma hora, atualização de 30s).
