---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, gateway, mercado-pago, fastpay, ironpay]
---

# ADR 003 — Interface única de gateway com Mercado Pago, FastPay e IronPay

**Status:** aceita em 2026-10-09. Mercado Pago é o gateway de produção; FastPay e IronPay ficam pré-configurados (adapters + variáveis de ambiente) e são ativados quando o dono tiver as chaves.

## Decisão
```ts
// src/server/gateways/types.ts
export interface PaymentGateway {
  readonly id: 'mercadopago' | 'fastpay' | 'ironpay' | 'demo';
  isConfigured(): boolean;
  createPixCharge(input: CreateChargeInput): Promise<PixCharge>;
  fetchStatus(ref: ProviderRef): Promise<ProviderStatus>;
  verifyWebhook(req: WebhookRequest): Promise<WebhookVerdict>;   // assinatura + extração do id
  refund(ref: ProviderRef, amountCents?: number): Promise<RefundResult>;
}
```
- `src/server/gateways/registry.ts` escolhe pelo `PAYMENT_GATEWAY` do `.env`. Se o adapter escolhido não estiver configurado (`isConfigured() === false`), a API responde `503 { code: 'GATEWAY_NOT_CONFIGURED' }` e o checkout mostra "Pagamentos em configuração". **Nunca** cai para o `demo` em produção.
- O gateway `demo` só é registrado quando `DEMO_MODE=true` **e** `NODE_ENV !== 'production'`.
- Cada gateway tem sua rota de webhook: `/api/webhooks/mercadopago`, `/api/webhooks/fastpay`, `/api/webhooks/ironpay`. A rota chama `verifyWebhook` do adapter correspondente, grava `WebhookEvent`, e entrega ao `orders.service` um evento normalizado `{ orderId, providerPaymentId, status: 'approved' | 'pending' | 'rejected' | 'refunded', amountCents }`.
- FastPay e IronPay: adapters com a estrutura completa, variáveis documentadas, `isConfigured()` por presença de chaves, e `TODO` marcados nos pontos onde o executor deve preencher URL/campos com a documentação oficial do provedor. Enquanto não preenchidos, `createPixCharge` lança `GatewayNotImplementedError` (fail-closed).

## Por que não usar o SDK oficial do Mercado Pago
O SDK Node (`mercadopago`) muda de interface entre versões e traz dependências desnecessárias. Chamadas HTTP diretas com `fetch`, `X-Idempotency-Key` e tipos próprios ficam mais estáveis e testáveis. Ver [[integracoes/mercado-pago]].

Relacionado: [[integracoes/fastpay]], [[integracoes/ironpay]], [[plano/tarefas/T07-gateways]].
