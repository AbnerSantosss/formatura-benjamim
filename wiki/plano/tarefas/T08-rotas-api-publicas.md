---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-2, api, webhooks, opus]
---

# T08 — Rotas de API públicas e webhooks

- **Modelo:** opus.
- **Depende de:** T01, T06, T07.
- **Arquivos (criar):** `src/server/http.ts`, `src/server/rate-limit.ts`, `src/app/api/pedidos/route.ts`, `src/app/api/pedidos/[id]/status/route.ts`, `src/app/api/numeros/ocupados/route.ts`, `src/app/api/campanha/route.ts`, `src/app/api/webhooks/mercadopago/route.ts`, `src/app/api/webhooks/fastpay/route.ts`, `src/app/api/webhooks/ironpay/route.ts`, `src/app/api/demo/aprovar/route.ts`, `src/app/api/internal/expirar/route.ts`, `tests/integration/api.test.ts`.
- **Ler antes:** `node_modules/next/dist/docs/` → o arquivo de **Route Handlers** (`route.md`) e o guia de upgrade da versão 16 (params assíncronos). [[fluxos/compra-de-numeros]], [[fluxos/pagamento-pix]], [[arquitetura/arquitetura-alvo]].

## Contratos
| Rota | Entrada | Saída 200 | Erros |
|---|---|---|---|
| `POST /api/pedidos` | JSON `NewOrderInput` | `{ orderId, publicToken, expiresAt, status, pix: { qrCode, qrCodeBase64, ticketUrl } }` | 422 validação, 409 `{ code:'NUMBERS_TAKEN', numbers:[...] }`, 503 `GATEWAY_NOT_CONFIGURED`, 502 `GATEWAY_ERROR`, 429 |
| `GET /api/pedidos/[id]/status?t=` | — | `{ status, expiresAt, approvedAt }` | 404 |
| `GET /api/numeros/ocupados` | — | `{ occupied: number[], total: 5000 }` | — |
| `GET /api/campanha` | — | resumo público (`raisedCents, goalCents, numbersSold, numbersAvailable, drawAt, drawPublic, winner?`) | — |
| `POST /api/webhooks/<gateway>` | corpo bruto | `{ received: true }` sempre 200 após assinatura válida | 401 assinatura inválida, 503 adapter não implementado |
| `POST /api/demo/aprovar` | `{ orderId }` | `{ ok: true }` | 404 fora de `isDemo` |
| `POST /api/internal/expirar` | header `Authorization: Bearer CRON_SECRET` | `{ expired: n }` | 401 |

Formato de erro sempre `{ code: string, message: string, details? }`.

## Passos
1. `src/server/http.ts`: `json(data, init?)`, `fail(error)` que mapeia `AppError` → status e `ZodError` → 422 com `details`, e qualquer outro → 500 com `code: 'INTERNAL'` (logar sem PII). `getClientIp(req)` lendo `x-forwarded-for` (primeiro) ou `x-real-ip`. `readRawBody(req)` para webhooks (`await req.text()`), nunca `req.json()` antes de validar assinatura.
2. `src/server/rate-limit.ts`: `rateLimit(key, { limit, windowMs })` em memória (`Map` com timestamps), devolvendo `{ ok, retryAfterSec }`. Limites: `POST /api/pedidos` 10/min por IP; webhooks sem limite; `GET` públicos 120/min por IP.
3. `POST /api/pedidos`: rate limit → `createOrder` → `getGateway().createPixCharge(...)` → `attachPayment` → resposta. Se `createPixCharge` lançar, `cancelOrder(orderId, 'gateway_error')` e propagar o erro (503 se não configurado, 502 se erro do provedor). `export const dynamic = 'force-dynamic'`.
4. `GET /api/pedidos/[id]/status`: `const { id } = await params` (Next 16), `t` da `searchParams`; `getOrderPublic`; devolver só status e datas. Para pedidos PENDING, se `env.PAYMENT_GATEWAY !== 'demo'` e `Payment.lastCheckedAt` foi há mais de 30 s, chamar `fetchStatus` e `applyProviderStatus` (fallback caso o webhook atrase) e atualizar `lastCheckedAt`.
5. `GET /api/numeros/ocupados` e `GET /api/campanha`: `Cache-Control: no-store`.
6. Webhooks: para cada gateway, `const gw = getGatewayById('mercadopago')`; `verifyWebhook` → se `!ok`, 401 (ou 503 se `reason === 'not-implemented'`). Depois `prisma.webhookEvent.create` com `@@unique([gateway, eventId])`; em `P2002` responder 200 `{ received: true, duplicate: true }`. Então `fetchStatus(ref)` → `orderId = externalReference` → `applyProviderStatus`. Se `changed && status === 'APPROVED'`, `sendEmail('pedido-confirmado')` (quando a T15 existir; até lá deixar um `// TODO(T18): e-mail`). Marcar `WebhookEvent.processedAt`. Qualquer exceção depois de gravar o evento: logar, gravar `WebhookEvent.error`, responder 200 (o MP reenvia se não for 200; preferimos reprocessar por consulta de status).
7. `POST /api/demo/aprovar`: se `!isDemo`, 404. Senão `demoApprove(orderId)` + `applyProviderStatus({ status:'approved', amountCents: order.amountCents, providerPaymentId: 'demo-'+orderId })`.
8. `POST /api/internal/expirar`: compara `Authorization` com `CRON_SECRET` em tempo constante; chama `expireStaleOrders(new Date())`.
9. Testes de integração chamando os handlers diretamente (`await POST(new Request('http://x/api/pedidos', { method:'POST', body: JSON.stringify(...) }))`) com `.env.test` (`PAYMENT_GATEWAY=demo`, `DEMO_MODE=true`): criação OK; 409 em conflito; 422 em CPF inválido; status com token errado 404; webhook MP com assinatura válida (gerar HMAC no teste e `vi.stubGlobal('fetch')` para o `fetchStatus`) aprova; o mesmo webhook duas vezes não duplica; `demo/aprovar` aprova; `internal/expirar` sem segredo 401.

## Critério de aceite
```
docker compose -f docker-compose.test.yml up -d
npm run test:integration
npm run typecheck && npm run lint && npm test && npm run build
```

## Não fazer
- Não aceitar `status`, `amountCents` de confirmação ou `approved` vindos do cliente.
- Não responder 500 para webhook depois de gravar o evento.
- Não usar `params.id` sem `await` (Next 16).
- Não criar rota que exponha CPF, e-mail ou telefone sem autenticação.
