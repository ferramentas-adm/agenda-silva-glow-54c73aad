# Plano: 3 pontos em aberto

## 1. Telefones com símbolos (CSV "nunca compareceram" e "Fechou depois")
Hoje a busca compara o telefone exatamente como foi digitado. Se o lead foi salvo como "(11) 99999-9999" numa reunião e "11999999999" em outra, o sistema acha que são pessoas diferentes. Resultado: o CSV pode trazer quem já teve reunião futura, e o "Fechou depois" pode não achar a venda.

O que muda:
- A comparação passa a usar só os números do telefone (já existe uma regra no banco que faz isso).
- Nenhum telefone salvo é alterado; só a forma de buscar.
- Antes de publicar, comparo o CSV atual com o novo e mostro quantos leads entram e saem.

## 2. Quadro "Por canal do agendamento" (Produtividade SDR)
Hoje o quadro ignora os filtros de time e de SDR da aba e sempre mostra todos.

O que muda:
- O quadro passa a respeitar o time (Tráfego / Social Selling) e o SDR escolhidos.
- Sem filtro, os números continuam iguais aos de hoje (confiro isso).

## 3. Modelos de IA
- Análise de leads: usa um modelo "preview" (versão de teste). Troco pela versão estável equivalente.
- Transcrição: usa um modelo de geração anterior. Troco pela versão atual equivalente.
- Testo uma análise e uma transcrição reais antes e depois, comparando qualidade e tempo. Se ficar pior, mantenho o atual.

## Ordem e segurança
Tudo fica primeiro no Preview. Publico só depois do seu ok. Os três itens são independentes: dá para aprovar só parte.

## Detalhes técnicos
- Item 1: `NaoComparecimentoTab.tsx` e `VendasTab.tsx` fazem `.in("lead_phone", ...)` com variantes de texto. Criar RPC `security definer` que recebe `text[]` de dígitos e filtra por `normalize_lead_phone(lead_phone)`, com índice de expressão em `agendamentos (normalize_lead_phone(lead_phone))`.
- Item 2: adicionar parâmetros opcionais `_team sdr_team` e `_sdr_id uuid` em `dashboard_agendamentos_por_booking_channel` / `dashboard_agendas_por_canal` (default null = comportamento atual) e passá-los em `BookingChannelPanel.tsx` / `AgendasPorCanalPanel.tsx`.
- Item 3: `analisar-lead-ia` (`google/gemini-3-flash-preview`) e `sdr-ia-transcrever` (`google/gemini-2.5-flash`) → modelos estáveis atuais do gateway, validados contra a lista de modelos disponíveis.
