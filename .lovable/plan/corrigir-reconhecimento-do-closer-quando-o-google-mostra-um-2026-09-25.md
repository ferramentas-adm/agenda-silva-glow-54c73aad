# Corrigir reconhecimento do closer quando o Google mostra um nome mais curto

## Causa (confirmada)
- No Meet, o Igor aparece como "Igor Occon".
- O nome oficial dele guardado nos bastidores é "Igor Matheus Occon Manoel".
- A regra atual compara só o primeiro e o **último** nome: "igor + manoel" contra "igor + occon". Não bate, então o Igor é contado como lead. Por isso aparece "Só o lead na sala".
- O mesmo problema acontece com qualquer pessoa da equipe que use no Google um sobrenome do meio.

## Nova regra
Uma pessoa conta como equipe quando:
1. Está conectada com uma conta Google e tem pelo menos 2 palavras no nome.
2. O primeiro nome é igual ao primeiro nome oficial.
3. Todos os outros nomes que aparecem na sala fazem parte do nome oficial. Por exemplo: "Igor Occon", "Igor Manoel" e "Igor Matheus Occon" contam como o Igor.

Continua sendo lead:
- Quem tem o mesmo primeiro nome e outro sobrenome, como "Igor Santos".
- Quem tem só uma palavra no nome, quem entrou sem conta Google e quem entrou por telefone.

Continua amarelo, com "Não consigo identificar quem está na sala": quando o nome também bate com o do lead da reunião.

Os nomes que aparecem no calendário e nas telas não mudam.

## Detalhes técnicos
- `supabase/functions/meet-presenca/index.ts`: trocar o `Set` de chaves `primeiro|último` por uma lista de nomes oficiais em palavras. Usar `palavras()` e remover partículas (da, de, do, dos, das, e). Casamento: `dn[0] === of[0]`, `dn.length >= 2` e todos os `dn[1..]` presentes em `of[1..]`. Aplicar a mesma lógica à comparação com o lead para detectar o caso ambíguo.
- Publicar a função e conferir na próxima reunião em andamento.
