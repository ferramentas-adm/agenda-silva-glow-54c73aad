# Checklist de validação antes de publicar

Vou executar a validação agora, no preview, e reportar cada item com resultado (OK / falhou / observação). Sem alterar código do app.

## 1. Saúde geral (leitura)
- Build sem erros e console/network do preview sem erros críticos.
- Login e carregamento do Dashboard, Calendário, Lista de Reuniões, Follow-ups e Administração.
- Card novo de Produtividade por Hora: seletor de comparação (Período anterior, Última semana, médias de 2/3/4 últimas quartas) muda cabeçalho, coluna delta e resumo de melhor/pior hora.

## 2. Fluxo de agendamento (teste rápido ponta a ponta)
- Abrir "Novo Agendamento": tempo de carregamento e busca de lead por nome e telefone.
- Verificar que os horários exibidos respeitam a faixa configurada em Configurações Gerais.
- Criar 1 agendamento de teste para a closer piloto (Giovanna), em horário fora do expediente comercial para não conflitar com lead real.
- Conferir no banco: registro criado com closer, SDR, horário em America/Sao_Paulo e `meta_lead_id` quando aplicável.
- Conferir o evento no Google Calendar da closer e a presença do link do Meet.

## 3. Gravação e transcrição automáticas
- Confirmar token Google da closer piloto presente e com escopo `meetings.space.created`.
- Confirmar flag `auto_recording_enabled` ativa para a closer piloto.
- Conferir nos logs de `google-create-event` que o espaço do Meet foi criado via Meet API v2 com `autoRecordingGeneration` e `autoTranscriptionGeneration` habilitados (e não caiu no fallback).
- Ler a configuração do espaço do Meet criado para confirmar que os dois flags voltam ativos.

## 4. Integrações disparadas pelo agendamento
- Meta CAPI: verificar que o trigger de `Schedule` disparou e a resposta foi 200.
- DataCrazy: verificar o disparo do webhook de status do agendamento de teste.

## 5. Limpeza
- Cancelar/excluir o agendamento de teste com justificativa "teste de validação".
- Confirmar remoção do evento na agenda do Google.
- Confirmar que a limpeza não deixou pendências em Follow-ups nem travamento de tela por reunião vencida.

## Notas técnicas
- Validação por leitura de banco (`read_query`), logs de edge functions, chamadas diretas às funções (`curl_edge_functions`) e Playwright no preview para o fluxo de UI.
- Nenhum arquivo do projeto será modificado; o teste cria e depois remove um único agendamento.
- Se algum item falhar, reporto o diagnóstico e proponho a correção antes de publicar.
