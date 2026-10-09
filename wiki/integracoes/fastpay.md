---
tipo: integracao
atualizado: 2026-10-09
tags: [fastpay, pix, gateway, pendente]
---

# Integração: FastPay (pré-configurada)

**Status:** adapter esqueleto. O painel (Configurações → Gateways de pagamento) já tem o cartão do FastPay com os três campos e guarda as chaves cifradas, mas recusa ativar enquanto os `TODO` abaixo não forem preenchidos ([[decisoes/015-credenciais-de-gateway-no-painel]]).

## Variáveis (`.env`)
| Variável | Uso |
|---|---|
| `FASTPAY_API_URL` | base da API (ex.: `https://api.fastpay.com.br`) — confirmar na doc do provedor |
| `FASTPAY_API_KEY` | chave privada; header de autenticação |
| `FASTPAY_WEBHOOK_SECRET` | validação da assinatura do webhook |

## Contrato esperado do adapter (`src/server/gateways/fastpay.ts`)
- `isConfigured()` → true só se as três variáveis existirem.
- `createPixCharge` → `// TODO(fastpay): POST <endpoint de cobrança Pix>` mapeando `amountCents`, `external_reference = order.id`, expiração 10 min, payer (nome, e-mail, CPF). Até preencher, lança `GatewayNotImplementedError('fastpay')`.
- `fetchStatus` → `// TODO(fastpay): GET <endpoint de consulta>` e mapear para `approved | pending | rejected | refunded`.
- `verifyWebhook` → `// TODO(fastpay): validar assinatura conforme doc`, extrair `providerPaymentId` e `external_reference`. Até preencher, retorna `{ ok: false, reason: 'not-implemented' }` (a rota responde 503 e **não** processa).
- `refund` → `// TODO(fastpay)`.
- Rota: `src/app/api/webhooks/fastpay/route.ts` já existe e delega ao adapter.

## Como ativar (humano)
1. Obter conta e chaves no FastPay; ler a documentação de Pix e webhooks.
2. Preencher os `TODO(fastpay)` com os endpoints e campos reais (tarefa curta, modelo `opus`: envolve dinheiro e webhook).
3. Rodar `npm run test:integration -- gateways/fastpay` com `FASTPAY_*` de sandbox.
4. Marcar `implemented: true` em `src/domain/gateway-fields.ts` e, no painel, clicar em "Usar este gateway" (ou trocar `PAYMENT_GATEWAY=fastpay` e reiniciar o container).

Relacionado: [[decisoes/003-multi-gateway]].
