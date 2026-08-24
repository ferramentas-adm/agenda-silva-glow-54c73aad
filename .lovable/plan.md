# Corrigir o piscar do banner "Conectar Google Calendar"

## O que está acontecendo

O banner é decidido por duas consultas em sequência: primeiro descobre se o usuário é um closer, depois se ele já tem a conta Google conectada. Enquanto a segunda consulta ainda está carregando, o resultado é "indefinido" — e o código atual trata isso como "não conectado". Resultado: o banner aparece por uma fração de segundo e desaparece quando a resposta chega.

## Correção

- Só renderizar o banner quando a verificação do token estiver de fato concluída e retornar "sem conexão". Enquanto carregar, não mostrar nada.
- Aplicar a mesma regra ao encadeamento: se a checagem de closer ainda está carregando, nada é exibido.
- Manter o comportamento atual de atualizar ao voltar o foco na janela (retorno do popup do OAuth), mas sem reexibir o banner durante o refetch de fundo.

## Detalhes técnicos

Em `src/components/GoogleCalendarBanner.tsx`:
- Capturar `isSuccess` (ou `isFetched`) das duas queries (`closer-match` e `closer-has-google-token`).
- Trocar a guarda `if (!closerMatch || hasToken) return null;` por uma condição que exige: closer identificado, query do token concluída e `hasToken === false`.
- Usar `placeholderData`/estado anterior no refetch por foco para não voltar ao estado indefinido (evita um segundo piscar).

Nenhuma mudança de backend, permissão ou lógica de negócio.
