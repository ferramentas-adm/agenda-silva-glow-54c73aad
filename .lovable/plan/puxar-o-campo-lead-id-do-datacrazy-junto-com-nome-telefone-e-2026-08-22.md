# Puxar o campo "Lead ID" do DataCrazy junto com nome, telefone e tag

## O que eu verifiquei agora (fatos, não suposição)

Consultei a API do DataCrazy usando o mesmo token que o app usa hoje para puxar nome, telefone e a tag "agendamento":

- `GET /leads?filter[tags]=agendamento` — o lead volta apenas com: `id`, `name`, `phone`, `rawPhone`, `email`, `tags`, `lists`, `address`, `contacts`, `metrics`, `attendant`, `company`, `taxId`, `site`, `instagram`, `notes`, `rating`, `source`, `sourceReferral`, `birthDate`, `createdAt`, `updatedAt`. **Nenhum campo adicional/personalizado.**
- `GET /leads/{id}` (lead individual) — mesma resposta, sem campos adicionais.
- Varri **300 leads** com a tag "agendamento": zero ocorrências de qualquer valor `GS-XXXX` e zero ocorrências do ID `9aced571-21e8-403f-aa22-33922db57f22`.
- Testei os endpoints de campos: `/fields`, `/custom-fields`, `/properties`, `/leads/{id}/fields`, `/leads/{id}/custom-fields`, `/leads/{id}/custom-field-values`, `/leads/custom-fields`, `/settings/fields`, `/tenants/fields`, além das variações na base `api.datacrazy.io/v1/crm/...` — **todos retornam 404**.
- Testei também `?include=customFields` — ignorado, resposta idêntica.

Conclusão: o ID `9aced571-…` que você viu no Network é da **API interna do painel do DataCrazy**, autenticada pela sua sessão de navegador. O token de API do app (o mesmo que já puxa nome/telefone/tag) não tem acesso a essa rota. Por isso não é uma questão de "puxar junto" — o dado não existe na resposta que a API pública nos entrega.

## O que preciso de você para destravar (1 passo)

No painel do DataCrazy, na aba **Network** onde você achou esse ID, clique na requisição e copie a **URL completa** (o campo "Request URL"). Exemplo do que estou procurando:

```text
https://api.datacrazy.io/v1/crm/api/crm/leads/<id>/custom-fields
```

Com essa URL eu descubro a rota exata. A partir daí, dois cenários:

- **A rota aceita o token de API do app** — é só plugar. Sigo direto para a implementação abaixo.
- **A rota exige um token de sessão/permissão diferente** — nesse caso preciso de um token do DataCrazy com acesso a campos personalizados, ou partimos para o plano alternativo.

## Implementação (assim que a rota estiver confirmada)

1. **Edge Function `datacrazy-proxy`**
   - Nos agregadores `by-tag-page`, `search-compact` e `by-tag-compact`, buscar o campo adicional do lead pela rota confirmada e ler o valor do campo de ID `9aced571-21e8-403f-aa22-33922db57f22`.
   - Fazer isso em lote/paralelo com limite de concorrência, para não degradar o tempo de carregamento da tela de agendamento (hoje ~1s).
   - Devolver o valor como `meta_lead_id` no objeto compacto, junto de `id`, `name`, `phone` e `tags`.
   - Cache de 60s por página, igual ao que já existe.

2. **Cliente (`datacrazy.ts`, `leadsStore.ts`, `LeadSearch.tsx`)**
   - Propagar `meta_lead_id` do proxy até o objeto `Lead` selecionado na tela "Novo Agendamento".

3. **`metaTracking.ts`**
   - Ler `meta_lead_id` direto do lead quando presente (fonte confiável), mantendo o fallback atual por regex `GS-XXXX`.

4. **Persistência**
   - `collectLeadMetaFields` já é chamada no `AgendarPage` e o resultado já é gravado em `agendamentos.meta_lead_id`, tanto no insert quanto no reagendamento no mesmo dia. Nada a mudar aqui.

5. **Validação**
   - Conferir no banco que agendamentos novos passam a gravar `meta_lead_id` no formato `GS-XXXX`.
   - Disparar um evento de teste para confirmar que o `lead_id` chega preenchido no Meta CAPI.

## Plano alternativo (se a rota interna não for utilizável)

O `GS-XXXX` é gerado no projeto **Formulário Grupo Silva**, não no DataCrazy — o DataCrazy é só uma cópia. Então buscamos na origem: no momento em que o SDR seleciona o lead, o backend consulta o Formulário pelo telefone e devolve o Lead ID. Mais confiável, menos frágil, e não depende de rota interna nem de campo preenchido manualmente no CRM.

## Não envolve

- Nenhuma mudança de banco (`agendamentos.meta_lead_id` já existe).
- Nenhuma mudança no endpoint de destino do Meta CAPI.
