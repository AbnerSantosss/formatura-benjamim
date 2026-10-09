---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-1, gateway, mercado-pago, fastpay, ironpay]
---

# T07 — Gateways de pagamento (interface, registro, Mercado Pago, FastPay, IronPay, demo)

Duas subtarefas. **T07a** pode rodar em paralelo com T06. **T07b** depende de T07a.

## T07a — Interface, registro e adapters esqueleto
- **Modelo:** opus.
- **Depende de:** T03, T04.
- **Arquivos (criar):** `src/server/gateways/types.ts`, `registry.ts`, `demo.ts`, `fastpay.ts`, `ironpay.ts`, `tests/gateways/registry.test.ts`.
- **Ler antes:** [[decisoes/003-multi-gateway]], [[integracoes/fastpay]], [[integracoes/ironpay]].

### Passos
1. `types.ts`: copiar a interface `PaymentGateway` de [[decisoes/003-multi-gateway]] e definir `CreateChargeInput { order: { id; amountCents; expiresAt }, product: { title; mode; unitPriceCents }, quantity: number, payer: { name; email; cpf } }`, `PixCharge { providerOrderId?; providerPaymentId?; qrCode; qrCodeBase64; ticketUrl?; expiresAt; raw: unknown }`, `ProviderRef { providerOrderId?; providerPaymentId? }`, `ProviderStatus { status: 'approved'|'pending'|'rejected'|'refunded'; amountCents: number; providerPaymentId: string; externalReference?: string; raw }`, `WebhookRequest { headers: Headers; url: string; rawBody: string }`, `WebhookVerdict = { ok: true; eventId: string; ref: ProviderRef } | { ok: false; reason: string }`, `RefundResult { ok: boolean; providerRefundId?: string; raw }`.
2. `demo.ts`: `isConfigured()` = `isDemo`; `createPixCharge` devolve QR falso (`qrCode = 'DEMO-' + order.id`, `qrCodeBase64` = PNG 1x1 em base64 fixa), `fetchStatus` lê um `Map` em memória alimentado por `demoApprove(orderId)` (exportada), `verifyWebhook` retorna `{ ok: false, reason: 'demo' }`, `refund` ok.
3. `fastpay.ts` e `ironpay.ts`: conforme as páginas da wiki, com `TODO(<nome>)` nos pontos indicados e lançando `GatewayNotImplementedError`.
4. `registry.ts`: `getGateway(): PaymentGateway` escolhe por `env.PAYMENT_GATEWAY`; lança `GatewayNotConfiguredError` se `demo` fora de `isDemo` ou se `isConfigured() === false`; `getGatewayById(id)` para as rotas de webhook e estorno; `gatewayHealth()` devolve `{ active, configured: boolean, others: Record<id, boolean> }` sem valores de chave.
5. Testes: registro escolhe `demo` em dev; `demo` em produção lança; `fastpay` sem chaves → `isConfigured() === false`.

### Critério de aceite (7a)
```
npm run typecheck && npm run lint && npm test
```

## T07b — Adapter Mercado Pago
- **Modelo:** opus.
- **Depende de:** T07a.
- **Arquivos (criar):** `src/server/gateways/mercadopago.ts`, `tests/gateways/mercadopago.test.ts`; (atualizar se divergir) `wiki/integracoes/mercado-pago.md`.
- **Ler antes:** [[integracoes/mercado-pago]] inteira. **Obrigatório:** abrir com WebFetch a documentação oficial de (1) Orders API Pix, (2) Payments API Pix, (3) "Validar origem da notificação" dos Webhooks, (4) Refunds. Se algum campo da wiki estiver diferente da doc, corrigir a wiki ANTES de codar e dizer isso no relatório.

### Passos
1. Implementar `createPixCharge` para `MP_API_FLAVOR = orders` e `payments` (duas funções internas; a pública escolhe pelo env). Headers: `Authorization`, `Content-Type`, `X-Idempotency-Key: order.id`. Valores em reais como string com 2 casas (`(cents/100).toFixed(2)`) para Orders; número para Payments. Expiração = 10 minutos. Montar o item conforme [[decisoes/002-produto-antes-do-gateway]]; `external_reference = order.id`.
2. `fetchStatus`: GET da order ou do payment; mapear status conforme a wiki; preencher `externalReference`.
3. `verifyWebhook`: ler `x-signature`, `x-request-id`, `data.id` da query (ou do corpo), montar o manifest, HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparar com `timingSafeEqualHex`, rejeitar `ts` com mais de 5 min. Devolver `eventId = x-request-id` e `ref.providerPaymentId = data.id`. **Não** devolver `orderId` do corpo; a rota vai buscar o pagamento (`fetchStatus`) e usar `externalReference`.
4. `refund`: `POST /v1/payments/{id}/refunds` com `X-Idempotency-Key`.
5. Timeouts de 15 s com `AbortController`; erros HTTP viram `AppError('GATEWAY_ERROR', 502)` com o status e o `message` do MP (sem token).
6. Testes com `vi.stubGlobal('fetch', ...)`: cria cobrança e extrai QR (orders e payments); assinatura válida passa; assinatura inválida falha; `ts` antigo falha; status `approved` mapeia; 401 vira `GATEWAY_ERROR`. Gerar a assinatura de teste com o mesmo HMAC para garantir o manifest.

### Critério de aceite (7b)
```
npm run typecheck && npm run lint && npm test
grep -rn "MP_ACCESS_TOKEN" src/app src/components ; echo "(esperado: nada)"
```

## Não fazer
- Não instalar o SDK `mercadopago`.
- Não inventar nomes de campos; só os confirmados na doc.
- Não confiar em `status` recebido no corpo do webhook.
