# Puxar "Lead ID" do DataCrazy para o meta_lead_id

## Contexto
O usuário criou no DataCrazy um campo personalizado chamado "Lead ID" dentro de "campo adicional do lead". O valor segue o padrão `GS-XXXX` (ex: `GS-2EKRCAFJ`, `GS-N94W6BNR`) e deve preencher o campo `meta_lead_id` da tabela `agendamentos`, para uso no envio de eventos Meta CAPI.

## O que falta confirmar
- O nome técnico/slug do campo personalizado no DataCrazy (será identificado no print da tela de cadastro do campo).

## O que será feito
1. **Mapear o campo no DataCrazy**
   - Ao receber o print, identificar o nome da propriedade que a API do DataCrazy retorna para esse campo adicional (costuma ser algo como `customFields`, `additionalFields`, `fields` ou similar).
   - Confirmar se o valor `GS-XXXX` vem como string pura ou dentro de um objeto.

2. **Ajustar a Edge Function `datacrazy-proxy`**
   - No endpoint que busca leads por tag, incluir o campo personalizado na resposta compacta.
   - Garantir que o valor `GS-XXXX` seja extraído corretamente e devolvido junto com `id`, `name`, `phone` e `tags`.

3. **Atualizar `src/lib/metaTracking.ts`**
   - Além da busca atual por `GS_ID_RE` em qualquer campo do lead, priorizar explicitamente o campo personalizado "Lead ID" quando presente.
   - Manter o fallback do regex para leads que ainda não tenham o campo preenchido.

4. **Garantir persistência no agendamento**
   - Verificar que `collectLeadMetaFields` é chamada no fluxo de agendamento e que o `meta_lead_id` resultante é salvo em `agendamentos.meta_lead_id`.
   - Validar que reagendamentos/segundas reuniões também carregam o valor do lead original.

5. **Testar ponta a ponta**
   - Simular um lead com o campo "Lead ID" preenchido no DataCrazy.
   - Confirmar que ao selecionar esse lead no "Novo Agendamento", o `meta_lead_id` é preenchido com o valor `GS-XXXX`.

## Não envolve
- Criação de novas tabelas ou colunas (a coluna `meta_lead_id` já existe em `agendamentos`).
- Alteração no endpoint de destino Meta CAPI (apenas a origem do dado muda).
