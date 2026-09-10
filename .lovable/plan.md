# Preencher setembro na planilha de motivos

## Objetivo
Ter na planilha mensal de setembro uma aba para cada dia de 01/09/2026 a 10/09/2026, no mesmo formato da aba que já existe.

## O que será feito
- Rodar a exportação diária, um dia por vez, para as datas de 01/09/2026 até 08/09/2026.
- Conferir se as abas 09-09-2026 e 10-09-2026 já existem; se alguma estiver faltando ou vazia, rodar novamente para essa data.
- Cada dia entra em sua própria aba (`DD-MM-YYYY`) dentro da planilha do mês, com cabeçalho, resumo por motivo e a lista de leads.
- Reenvio de um dia já existente reescreve a aba, então não há risco de linhas duplicadas.
- Nada é criado nem alterado no sistema: só a planilha é preenchida.

## Verificação
- Listar as abas da planilha de setembro e confirmar as 10 datas presentes.
- Conferir o total de leads de cada dia contra os dados do painel.
- Dias sem registros geram aba com total zero, o que é esperado.

## Detalhes técnicos
- Reutiliza a Edge Function `sheets-motivos-daily`, chamada com `{ "date": "2026-09-0X", "kind": "manual" }` e o cabeçalho `x-cron-secret`.
- Chamadas sequenciais (a função ignora pedidos concorrentes por `already_running`), com pausa entre elas para respeitar a cota do Google Sheets.
- Cada execução fica registrada em `sheets_motivos_runs`; a planilha do mês continua a mesma em `sheets_motivos_exports`.
