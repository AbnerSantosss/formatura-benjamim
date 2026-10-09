---
tipo: integracao
atualizado: 2026-10-09
tags: [ironpay, pix, gateway, pendente]
---

# Integração: IronPay (pré-configurada)

**Status:** adapter esqueleto, sem chaves. Fica inativo até `PAYMENT_GATEWAY=ironpay` e credenciais presentes.

## Variáveis (`.env`)
| Variável | Uso |
|---|---|
| `IRONPAY_API_URL` | base da API (ex.: `https://api.ironpay.com.br`) — confirmar na doc do provedor |
| `IRONPAY_API_KEY` | chave privada; header de autenticação |
| `IRONPAY_WEBHOOK_SECRET` | validação da assinatura do webhook |

## Contrato esperado do adapter (`src/server/gateways/ironpay.ts`)
- `isConfigured()` → true só se as três variáveis existirem.
- `createPixCharge` → `// TODO(ironpay): POST <endpoint de cobrança Pix>` mapeando `amountCents`, `external_reference = order.id`, expiração 10 min, payer (nome, e-mail, CPF). Até preencher, lança `GatewayNotImplementedError('ironpay')`.
- `fetchStatus` → `// TODO(ironpay): GET <endpoint de consulta>` e mapear para `approved | pending | rejected | refunded`.
- `verifyWebhook` → `// TODO(ironpay): validar assinatura conforme doc`, extrair `providerPaymentId` e `external_reference`. Até preencher, retorna `{ ok: false, reason: 'not-implemented' }` (a rota responde 503 e **não** processa).
- `refund` → `// TODO(ironpay)`.
- Rota: `src/app/api/webhooks/ironpay/route.ts` já existe e delega ao adapter.

## Como ativar (humano)
1. Obter conta e chaves no IronPay; ler a documentação de Pix e webhooks.
2. Preencher os `TODO(ironpay)` com os endpoints e campos reais (tarefa curta, modelo `opus`: envolve dinheiro e webhook).
3. Rodar `npm run test:integration -- gateways/ironpay` com `IRONPAY_*` de sandbox.
4. Trocar `PAYMENT_GATEWAY=ironpay` e reiniciar o container.

Relacionado: [[decisoes/003-multi-gateway]].
