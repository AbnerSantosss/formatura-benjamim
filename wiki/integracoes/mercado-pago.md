---
tipo: integracao
atualizado: 2026-10-09
tags: [mercado-pago, pix, webhook, gateway]
---

# Integração: Mercado Pago (Pix)

> **Regra para o executor:** antes de codar o adapter, abrir a documentação oficial
> (https://www.mercadopago.com.br/developers/pt/docs) e confirmar os campos abaixo.
> Se algo mudou, atualizar esta página antes de escrever código. Nunca inventar campo.

## Credenciais (`.env`)
| Variável | Onde pegar | Uso |
|---|---|---|
| `MP_ACCESS_TOKEN` | Suas integrações → Credenciais de produção (ou de teste) → Access Token | header `Authorization: Bearer` em todas as chamadas (servidor) |
| `MP_PUBLIC_KEY` | mesma tela | não é usado no Pix transparente; manter por completude |
| `MP_WEBHOOK_SECRET` | Suas integrações → Webhooks → "Assinatura secreta" | validar `x-signature` |
| `MP_ENVIRONMENT` | `sandbox` ou `production` | apenas informativo; a credencial define o ambiente |

Credenciais de **teste** criam pagamentos falsos; usar conta de teste "comprador" para pagar. Credenciais de **produção** movimentam dinheiro real.

## Criar cobrança Pix (preferência: Orders API)
`POST https://api.mercadopago.com/v1/orders`

Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `X-Idempotency-Key: <order.id>`.

Corpo (conferir na doc):
```json
{
  "type": "online",
  "external_reference": "<order.id>",
  "total_amount": "25.00",
  "processing_mode": "automatic",
  "payer": { "email": "<contributor.email>", "first_name": "<nome>", "last_name": "<sobrenome>",
             "identification": { "type": "CPF", "number": "<11 dígitos>" } },
  "items": [ { "title": "Cestas O Boticário — 50 números", "unit_price": "0.50", "quantity": 50,
               "description": "Participação na campanha do Benjamim" } ],
  "transactions": { "payments": [ { "amount": "25.00",
                     "payment_method": { "id": "pix", "type": "bank_transfer" },
                     "expiration_time": "PT10M" } ] }
}
```
Resposta relevante: `id` (providerOrderId), `transactions.payments[0].id` (providerPaymentId), `transactions.payments[0].payment_method.qr_code`, `.qr_code_base64`, `.ticket_url`, `status`/`status_detail`.

**Fallback (Payments API, caso Orders Pix não esteja habilitado na conta):** `POST /v1/payments` com `transaction_amount`, `payment_method_id: "pix"`, `payer.email`, `external_reference`, `date_of_expiration` (ISO com fuso). QR em `point_of_interaction.transaction_data.qr_code` / `qr_code_base64` / `ticket_url`. O adapter deve implementar os dois e escolher por `MP_API_FLAVOR=orders|payments` (padrão `orders`).

## Consultar status
- Orders: `GET /v1/orders/{id}`.
- Payments: `GET /v1/payments/{id}` → `status` em `approved | pending | in_process | rejected | cancelled | refunded | charged_back`.

Mapeamento para o domínio: `approved → approved`; `pending | in_process → pending`; `rejected | cancelled → rejected`; `refunded | charged_back → refunded`.

## Webhook
- Configurar em Suas integrações → Webhooks → URL `https://<dominio>/api/webhooks/mercadopago`, eventos **Pagamentos** (e **Orders** se usar Orders API).
- Headers recebidos: `x-signature: ts=<ts>,v1=<hmac>`, `x-request-id`. Query: `data.id`. Corpo: `{ "action": "payment.updated", "type": "payment", "data": { "id": "123" } }`.
- Validação (conferir na doc "Validar origem da notificação"):
  1. montar `manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"` (id em minúsculas se alfanumérico);
  2. `hmacSha256(MP_WEBHOOK_SECRET, manifest)` em hex;
  3. comparar com `v1` em tempo constante (`crypto.timingSafeEqual`);
  4. rejeitar se `ts` tiver mais de 5 min.
- Responder `200` rápido (menos de 22 s). Processar: gravar `WebhookEvent(gateway='MERCADOPAGO', eventId=x-request-id)`; se já existir, retornar 200 sem reprocessar. Depois buscar o pagamento server-to-server (**nunca** confiar no corpo) e chamar `orders.service.applyProviderStatus`.
- Em dev local, usar `ngrok` ou `cloudflared` para expor a porta 3000 e configurar a URL temporária.

## Estorno
`POST /v1/payments/{payment_id}/refunds` com `X-Idempotency-Key`. Corpo vazio = total; `{ "amount": 10.5 }` = parcial. Pix permite estorno em até 90 dias.

## Erros comuns
- `401`: token errado ou de outro ambiente.
- `400 "payer.email" inválido`: e-mail de teste precisa ser de usuário de teste.
- QR não aparece: conta sem Pix habilitado (ativar chave Pix na conta Mercado Pago).
- Webhook não chega: URL sem HTTPS ou firewall. Testar com o botão "Simular" do painel do MP.

## Pendências para produção (humano)
1. Criar aplicação no painel de desenvolvedor do Mercado Pago, modelo "Pagamentos online", integração "Checkout Transparente/API".
2. Copiar credenciais de produção para o `.env` do servidor.
3. Cadastrar URL do webhook e copiar a assinatura secreta.
4. Fazer um pagamento real de R$ 5 e conferir aprovação + e-mail + número confirmado.

Tarefas: [[plano/tarefas/T07-gateways]], [[plano/tarefas/T24-deploy]].
