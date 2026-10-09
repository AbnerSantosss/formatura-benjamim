---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-1, pedidos, transacao, opus]
---

# T06 — Serviço de pedidos (reserva transacional, expiração, aprovação, estorno)

- **Modelo:** opus.
- **Depende de:** T03, T04, T05.
- **Arquivos (criar):** `src/server/orders.service.ts`, `src/server/crypto.ts`, `src/server/audit.ts`, `src/server/errors.ts`, `tests/integration/orders.service.test.ts`, `vitest.integration.config.ts`, `.env.test`.
- **Ler antes:** [[fluxos/compra-de-numeros]], [[fluxos/pagamento-pix]] (tabela de estados), [[arquitetura/modelo-de-dados-alvo]], [[arquitetura/arquitetura-alvo]].

## Passos
1. `src/server/errors.ts`: classes `AppError(code, message, status)`, `ValidationError(422)`, `OrderConflictError(409, numbers: number[])`, `NotFoundError(404)`, `GatewayNotConfiguredError(503)`, `GatewayNotImplementedError(503)`, `ForbiddenError(403)`.
2. `src/server/crypto.ts`: `encryptCpf(cpf): string` e `decryptCpf(cipher): string` com AES-256-GCM (`CPF_ENCRYPTION_KEY`), formato `base64(iv).base64(tag).base64(data)`; `sha256Hex(s)`; `randomToken(bytes = 32): { raw: string (base64url), hash: string }`; `timingSafeEqualHex(a, b)`.
3. `src/server/audit.ts`: `audit(action: string, data: { actorId?: string; orderId?: string; meta?: Record<string, unknown> }, tx?)` grava `AuditLog`. Nunca receber CPF, e-mail ou telefone em `meta`.
4. `src/server/orders.service.ts` com `import 'server-only'` e as funções:
   - `createOrder(input: NewOrderInput, ctx: { now: Date; ip?: string }): Promise<CreatedOrder>`
     1. validar com `newOrderSchema`; buscar `Product` ativo; validar modo.
     2. se já existir `Order` com o mesmo `idempotencyKey`, devolver o existente (com `Payment`).
     3. `prisma.$transaction(async tx => { ... })`: criar `Contributor` (`cpfCipher`, `cpfLast4`), `Order` (PENDING, `expiresAt = now + reservationMin`, `publicToken = randomToken(16).raw`, `gateway = env.PAYMENT_GATEWAY` em maiúsculas), `OrderNumber[]` via `createMany`. Capturar erro Prisma `P2002` no índice `OrderNumber_number_active_unique` → consultar quais dos números pedidos estão ativos e lançar `OrderConflictError(numbers)`.
     4. devolver `{ order, product, contributor }` (sem o CPF em claro).
   - `attachPayment(orderId, charge: PixCharge)`: cria `Payment`.
   - `cancelOrder(orderId, reason)`: PENDING → CANCELED e `OrderNumber.active = false` (transação). Usado quando o gateway falha.
   - `expireStaleOrders(now)`: em transação, `updateMany` de PENDING com `expiresAt <= now` para EXPIRED e desativa seus números; devolve quantidade.
   - `applyProviderStatus(ev: { orderId; providerPaymentId; status; amountCents; raw })`: idempotente. Carrega pedido com `SELECT ... FOR UPDATE` (`$queryRaw` dentro de `$transaction`). Regras: `approved` em PENDING não expirado e `amountCents === order.amountCents` → APPROVED (`approvedAt`), `Payment.status`, `audit('order.approved')`. `approved` com valor diferente → mantém status, `audit('order.amount_mismatch')`. `approved` em EXPIRED/CANCELED → `audit('order.paid_after_expiry')` sem mudar status. `refunded` em APPROVED → REFUNDED + libera números. `rejected` em PENDING → CANCELED + libera. Qualquer outro caso → no-op com audit. Devolve `{ changed: boolean, status }` para o chamador decidir se envia e-mail.
   - `markRefunded(orderId, actorId)`: APPROVED → REFUNDED + libera números + audit. (A chamada ao gateway é feita pela rota admin antes.)
   - `getOrderPublic(id, token)`: devolve pedido + números + payment (qr, copia e cola, ticketUrl) + produto + primeiro nome; `null` se token não bater (comparação em tempo constante).
   - `getOccupiedNumbers(now)`: números de `OrderNumber.active = true` cujo pedido é APPROVED ou PENDING não expirado (expiração preguiçosa na leitura).
   - `getCampaignSummary(now)`: `raisedCents` (soma APPROVED), `pendingCents`, `refundedCents`, `numbersSold` (APPROVED), `numbersReserved` (PENDING válidos), `numbersAvailable`, `ordersCount` por status, `goalCents`, `drawAt`, `drawPublic`, `winner` (`{ number, firstName }` ou `null`, só se `drawPublic` e houver `Draw` não anulado).
5. `.env.test` com `DATABASE_URL=postgresql://test:test@localhost:5433/test`, `PAYMENT_GATEWAY=demo`, `DEMO_MODE=true`, `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3180` e segredos de teste fixos (hex de 64 zeros serve). `vitest.integration.config.ts` com `include: ['tests/integration/**/*.test.ts']`, mesmos `alias` do `vitest.config.ts`, `setupFiles` que carrega `.env.test` (`dotenv`), roda `prisma migrate deploy` uma vez (`execSync`) e trunca tabelas antes de cada arquivo. Script `"test:integration": "vitest run -c vitest.integration.config.ts"`. Instalar `npm install -D dotenv`.
6. Testes em `tests/integration/orders.service.test.ts` (subir `docker compose -f docker-compose.test.yml up -d` antes):
   - cria pedido NUMBERS com 10 números e R$ 5; números ficam ocupados.
   - **concorrência:** `Promise.all` de 5 `createOrder` com o mesmo número e chaves diferentes → exatamente 1 sucesso e 4 `OrderConflictError`.
   - mesma `idempotencyKey` duas vezes → mesmo `order.id`.
   - `expireStaleOrders` com `now + 11 min` expira e libera; os números voltam a estar disponíveis para um novo pedido.
   - `applyProviderStatus approved` aprova; chamada repetida não muda nada; valor diferente não aprova; em pedido expirado não aprova.
   - `markRefunded` libera números.
   - `getOrderPublic` com token errado devolve `null`.
   - `getCampaignSummary` soma só APPROVED.

## Critério de aceite
```
docker compose -f docker-compose.test.yml up -d
npm run test:integration
npm run typecheck && npm run lint && npm test
grep -rn "console.log" src/server/orders.service.ts ; echo "(esperado: nada)"
```

## Não fazer
- Não chamar gateway nem enviar e-mail dentro deste serviço (quem orquestra é a rota).
- Não aceitar `status` vindo do cliente em nenhuma função.
- Não guardar CPF em claro em lugar nenhum (nem em `AuditLog`).
- Não usar `Date.now()` dentro das funções; `now` sempre chega por parâmetro.
