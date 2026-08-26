# Enviar motivo de não comparecimento ao DataCrazy

Hoje toda ação "Não compareceu" grava `no_show` e o CRM recebe sempre `"status": "No-show"`, sem o motivo escolhido. O plano faz o payload refletir o motivo.

## Regras de envio

| Motivo escolhido | `status` enviado |
|---|---|
| No-show | No-show |
| Cancelou por desistência | Cancelar |
| Cancelou por imprevisto pessoal | Cancelar |
| Sem closer disponível | Cancelar |
| Alterou horário para o mesmo dia | Cancelar |
| Motivo personalizado (Administração) | No-show |
| Sem motivo (registros antigos) | No-show |

Em todos os casos o payload passa a incluir dois campos novos:
- `cancellation_reason`: o motivo exato escolhido pelo SDR/Closer
- `nao_comparecimento_bucket`: `"cancelada"` ou `"no_show"` (mesma classificação usada nos quadros do dashboard)

Nada muda no banco além da função de webhook: o status interno continua `no_show` e os quadros do dashboard seguem iguais.

## Exemplo do payload resultante

```json
{
  "lead_name": "Maria Souza",
  "lead_phone": "+5511988887777",
  "status": "Cancelar",
  "cancellation_reason": "Sem closer disponível",
  "nao_comparecimento_bucket": "cancelada",
  "scheduled_datetime": "2026-08-27T11:00:00Z",
  "created_at": "2026-08-26T03:05:12Z",
  "sdr_name": "João SDR",
  "closer_name": "Kauane",
  "channel_type": "indicacao",
  "...": "demais campos inalterados"
}
```

## Detalhes técnicos

- Migração alterando `public.notify_status_change_webhook()`:
  - novo bloco que, quando `NEW.status = 'no_show'` (e não é exclusão), normaliza `NEW.cancellation_reason` e decide `_status_display` entre `'Cancelar'` e `'No-show'` conforme a tabela acima;
  - lista de motivos "Cancelar" fixa na função (desistência, imprevisto pessoal, sem closer disponível, alterou horário para o mesmo dia), comparação case-insensitive com `trim`;
  - `jsonb_build_object` ganha `cancellation_reason` e `nao_comparecimento_bucket` (ambos `null` quando o status não é negativo).
- `status = 'cancelada'` (registros antigos) continua mapeando para `Cancelar`.
- Sem alteração no `datacrazy-webhook`, no `datacrazy-crm-sync` nem no webhook de venda.
- `src/services/datacrazyAgendamento.ts` (reenvio manual) não é usado hoje por nenhuma tela; fica como está.
