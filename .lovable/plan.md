# Plano: transcrição de áudio do SDR IA

## Implementação
- Criar a função `sdr-ia-transcrever` com CORS e autenticação por `x-api-key = SDR_IA_API_KEY`.
- Aceitar áudio por URL pública ou base64, validar MIME/tamanho máximo de 15 MB e rejeitar entradas inválidas.
- Encaminhar o arquivo ao endpoint de transcrição do Lovable AI com o modelo Gemini padrão de transcrição, mantendo a chave somente no servidor e limite de 40 segundos.
- Retornar a transcrição e o modelo usado; preservar as mensagens/status pedidos para 401, 400, 422 e 502.
- Configurar somente essa nova função com `verify_jwt=false`.

## Validação
- Implantar a função.
- Gerar fala curta real, converter para OGG e chamar a função com autenticação válida.
- Conferir a resposta real e testar também rejeição sem chave.
- Entregar um exemplo de `curl` para URL pública e informar o texto obtido no teste.

## Detalhes técnicos
- Será usado `google/gemini-3.5-transcribe` em `/v1/audio/transcriptions`, o caminho próprio do Lovable AI para transcrição Gemini; isso evita enviar áudio ao endpoint geral de chat.
- O download por URL será interrompido se ultrapassar 15 MB, inclusive quando o servidor não informar o tamanho antecipadamente.
- Nenhuma função, tabela ou fluxo existente será alterado.
