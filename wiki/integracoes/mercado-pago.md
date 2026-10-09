---
tipo: integracao
atualizado: 2026-10-09
tags: [mercado-pago, pix, webhook, gateway]
---

# Integração: Mercado Pago (Pix)

**Onde ficam as chaves:** no painel, em Configurações → Gateways de pagamento (cifradas no banco), ou nas variáveis `MP_*`; o painel vale no lugar do ambiente. Ver [[decisoes/015-credenciais-de-gateway-no-painel]].

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
                     "expiration_time": "PT30M" } ] }
}
```
Resposta relevante: `id` (providerOrderId, formato `ORD…`), `transactions.payments[0].id` (providerPaymentId, formato `PAY…`), `transactions.payments[0].payment_method.qr_code`, `.qr_code_base64`, `.ticket_url`, `status`/`status_detail` (logo após criar: `action_required` / `waiting_transfer`), `total_amount`, `total_paid_amount`, `external_reference`.

Conferido na doc oficial em 2026-10-09 (T07b):
- **Vencimento mínimo de 30 minutos.** `expiration_time` (duração ISO 8601) "deve ser de no mínimo 30 minutos a partir da criação do pagamento e no máximo 30 dias"; o padrão é 24 horas. O mesmo limite vale para `date_of_expiration` da Payments API. **`PT10M` não é aceito pela doc**, então o adapter envia 30 minutos (ou mais, se a reserva local for mais longa). A reserva local continua em 10 minutos: o Pix pode ser pago no banco entre o minuto 10 e o 30, depois de os números terem sido liberados. O serviço de pedidos precisa tratar "aprovado depois de expirado" (ver [[fluxos/pagamento-pix]]).
- `external_reference`: obrigatório para Pix, no máximo 64 caracteres, só letras, números, `-` e `_`.
- `payer.email` é obrigatório para Pix; `first_name`, `last_name` e `identification` são opcionais (ajudam na aprovação).
- `items[]` é opcional: `title` (até 150 caracteres), `unit_price` (string), `quantity` (inteiro), `description` (até 100 caracteres). O adapter não envia `description` do item (o `CreateChargeInput` não carrega a descrição do produto).
- `total_amount` tem de ser igual à soma de `transactions.payments[].amount` (erro `invalid_total_amount`).
- `X-Idempotency-Key`: obrigatório, de 1 a 128 caracteres. A referência lista `409 idempotency_key_already_used` ("já foi usado, tente com um novo valor"): **não está documentado se repetir a criação com a mesma chave devolve a order original**. Conferir no sandbox antes de reaproveitar `order.id` em novas tentativas.
- A criação pode ser assíncrona: a order volta em `processing` sem dados de QR. O adapter trata isso como erro (`GATEWAY_ERROR`) e a rota cancela o pedido.
- Credenciais: a referência lista `401 invalid_credentials` ("não há suporte para credenciais de teste; use usuários de teste com credenciais de produção") e `400 invalid_email_for_sandbox` (e-mail do pagador precisa terminar em `@testuser.com` no sandbox).

**Fallback (Payments API, caso Orders Pix não esteja habilitado na conta):** `POST /v1/payments` com `transaction_amount` (número), `description`, `payment_method_id: "pix"`, `payer` (`email`, `first_name`, `last_name`, `identification.type`/`number`), `external_reference`, `date_of_expiration` (formato do exemplo oficial: `2022-11-17T09:37:52.000-04:00`; mínimo 30 minutos, máximo 30 dias) e `additional_info.items[]` (`title`, `quantity` e `unit_price` numéricos). QR em `point_of_interaction.transaction_data.qr_code` / `qr_code_base64` / `ticket_url`; `id` numérico é o providerPaymentId. O adapter implementa os dois e escolhe por `MP_API_FLAVOR=orders|payments` (padrão `orders`). A doc avisa que a API de Payments não recebe mais funcionalidades novas, só correções.

## Consultar status
- Orders: `GET /v1/orders/{id}` → `status` / `status_detail`, `total_amount`, `total_paid_amount`, `external_reference`, `transactions.payments[]`.
- Payments: `GET /v1/payments/{id}` → `status` em `pending | approved | authorized | in_process | in_mediation | rejected | cancelled | refunded | charged_back`, `transaction_amount`, `external_reference`.

O adapter escolhe o endpoint pela referência guardada (tem `providerOrderId` → Orders; só `providerPaymentId` → Payments), não pelo `MP_API_FLAVOR` do momento.

Mapeamento para o domínio (qualquer valor desconhecido vira `pending`, nunca `approved`):

| API | Status do Mercado Pago | Domínio |
|---|---|---|
| Payments | `approved` | `approved` |
| Payments | `pending`, `in_process`, `authorized`, `in_mediation` | `pending` |
| Payments | `rejected`, `cancelled` | `rejected` |
| Payments | `refunded`, `charged_back` | `refunded` |
| Orders | `processed` (com `accredited` ou `partially_refunded`) | `approved` |
| Orders | `created`, `processing`, `action_required`, `in_review` | `pending` |
| Orders | `failed`, `canceled`, `expired` | `rejected` |
| Orders | `refunded`, `charged_back` | `refunded` |

Valor conferido: Payments usa `transaction_amount`; Orders usa `total_paid_amount` quando aprovado (senão `total_amount`). Conferir no sandbox que `total_paid_amount` de um Pix pago é igual ao `total_amount`.

## Webhook
- Configurar em Suas integrações → Webhooks → URL `https://<dominio>/api/webhooks/mercadopago`, eventos **Pagamentos** (e **Orders** se usar Orders API).
- Headers recebidos: `x-signature: ts=<ts>,v1=<hmac>`, `x-request-id`. Query: `data.id` e `type`.
  - Tópico **payment** (Payments API): corpo `{ "action": "payment.updated", "type": "payment", "data": { "id": "123" } }`; `data.id` é o id numérico do pagamento.
  - Tópico **order** (Orders API): corpo `{ "action": "order.processed", "type": "order", "data": { "id": "ORD01…", "status": "processed", … } }`; **`data.id` é o id da order, não do pagamento**. O adapter devolve `ref.providerOrderId` nesse caso e `ref.providerPaymentId` no tópico payment. Outros tópicos são recusados (`unsupported-topic`).
- Validação (conferida na doc "Validar origem da notificação", aba "Sem SDKs", em 2026-10-09):
  1. separar o `x-signature` por `,` e cada parte por `=` para obter `ts` e `v1`;
  2. montar `manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"`, com `data.id` **da query string** e em minúsculas se vier alfanumérico em maiúsculas (ex.: `ORD01JQ…` → `ord01jq…`). Se `data.id` ou `x-request-id` não vierem na notificação, o trecho correspondente sai do manifest;
  3. `hmacSha256(MP_WEBHOOK_SECRET, manifest)` em hex;
  4. comparar com `v1` em tempo constante (`crypto.timingSafeEqual`);
  5. rejeitar se `ts` tiver mais de 5 min. A doc diz que `ts` vem em **milissegundos** (exemplo `ts=1742505638683`), mas outra página oficial mostra `ts=1704908010` (segundos); o adapter aceita os dois (menos de 12 dígitos = segundos). A tolerância de 5 min é escolha nossa: a doc só sugere "estabelecer uma tolerância".
- O adapter exige `x-request-id` (é o `eventId` da idempotência); sem ele o webhook é recusado.
- Notificações de Código QR não podem ser validadas pela assinatura secreta (não usamos esse produto).
- Responder `200` rápido (menos de 22 s). Processar: gravar `WebhookEvent(gateway='MERCADOPAGO', eventId=x-request-id)`; se já existir, retornar 200 sem reprocessar. Depois buscar o pagamento server-to-server (**nunca** confiar no corpo) e chamar `orders.service.applyProviderStatus`.
- Em dev local, usar `ngrok` ou `cloudflared` para expor a porta 3000 e configurar a URL temporária.

## Estorno
Conferido na doc oficial em 2026-10-09 (T07b). O endpoint depende da API em que a cobrança foi criada:
- **Payments API:** `POST /v1/payments/{payment_id}/refunds` com `X-Idempotency-Key` (obrigatório). Sem `amount` no corpo = total; `{ "amount": 10.5 }` (número) = parcial. Resposta: `id` (providerRefundId), `payment_id`, `amount`, `status`.
- **Orders API:** `POST /v1/orders/{order_id}/refund` com `X-Idempotency-Key` (obrigatório). Sem corpo = total; parcial = `{ "transactions": [ { "id": "<PAY…>", "amount": "10.50" } ] }` (string). Resposta: `id`, `status`, `status_detail` (`refunded` | `partially_refunded`), `transactions.refunds[].id` (providerRefundId). A doc orienta a não usar a API de Payments para cobranças criadas pela Orders API.

O adapter escolhe pela referência guardada (tem `providerOrderId` → Orders). Chave de idempotência: `refund-<id>-<centavos|full>`.

Erro em estorno Pix: por padrão, falha de comunicação com o Bacen volta como `400` mesmo com o estorno ainda em processamento; o header opcional `X-Render-In-Process-Refunds: true` faria a resposta vir `201` com `status: "in_process"`. O adapter **não** envia esse header: um `400` vira `GATEWAY_ERROR` e o admin confere no painel do MP antes de tentar de novo.

Prazo: o prazo máximo para estornar Pix **não está nas páginas consultadas** (a wiki dizia 90 dias, sem fonte). Confirmar antes de prometer prazo a alguém.

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
