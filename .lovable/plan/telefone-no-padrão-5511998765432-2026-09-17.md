# Telefone no padrão 5511998765432

Deixar a coluna de telefone sempre no formato só-dígitos com DDI do Brasil, nas duas saídas: o CSV que se baixa do card de motivos e a planilha diária do Google Sheets.

## Regra de formatação

A partir do que está gravado no cadastro do lead:

1. Remover tudo que não é número (espaços, parênteses, traços, "+").
2. Tirar zeros à esquerda (ex.: 011 999... vira 11 999...).
3. Se o número tiver 10 ou 11 dígitos (DDD + telefone), colocar 55 na frente.
4. Se já começar com 55 e tiver 12 ou 13 dígitos, manter como está.
5. Qualquer coisa fora desses casos (número incompleto, campo vazio, registro antigo torto) sai como está, só sem símbolos — melhor mostrar o que existe do que inventar um DDI.

Exemplos: `(11) 99876-5432` → `5511998765432`; `+55 11 3456-7890` → `551134567890`; `11998765432` → `5511998765432`.

## Onde muda

- **CSV offline do card "Motivos de não fechamento"**: a coluna Telefone passa a sair formatada. O CSV já envolve os valores em aspas, então o Excel/Sheets não vai transformar em número nem cortar dígitos.
- **Planilha do Google Sheets (envio diário)**: a coluna Telefone passa a sair formatada e a célula é gravada como texto, para o Google não exibir algo como 5,5119E+12.

Abas já enviadas continuam com o formato antigo; elas só mudam se o dia for reenviado.

## Detalhes técnicos

- Um helper único de formatação (`formatPhoneE164BR`) aplicado na montagem da linha, sem alterar o dado no banco.
- `src/components/dashboard/VendasTab.tsx`: usar o helper na coluna Telefone de `handleDownloadMotivosCsv` (o `phoneNorm` usado no cruzamento de leads recuperados fica como está).
- `supabase/functions/sheets-motivos-daily/index.ts`: usar o helper no valor de `lead_phone` da linha e garantir a célula como texto — manter `valueInputOption=USER_ENTERED` e enviar o telefone com apóstrofo inicial, ou trocar a coluna para formato texto no `batchUpdate` de formatação. Nenhuma outra coluna, cabeçalho ou cálculo muda.
- Nada de mudança em métricas, RPCs do dashboard ou formatos de `slot_id`/`agendamento_id`.
