---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, env, build, pedidos, auth, email]
---

# ADR 010 — Contratos reais da janela B (build, pedidos, auth, e-mail)

**Status:** aceita em 2026-10-09 pelo orquestrador, durante a execução do plano. Os itens marcados "decisão do dono" seguem o texto literal do plano até ele se pronunciar.

## Contexto
T06, T14 e T15 foram escritas antes de o schema e o `env.ts` existirem. Na execução apareceram diferenças entre o texto das tarefas e o código real. Esta página é a referência para T08, T16, T17, T18 e seguintes; onde ela divergir do texto de uma tarefa, vale esta página e o código.

## Decisões
1. **Build.** `next build` roda com `NODE_ENV=production` e avalia `src/server/env.ts` ao coletar as rotas. As exigências de produção (sem `DEMO_MODE`, sem gateway `demo`, segredos obrigatórios) passam a valer só quando o servidor sobe: durante o build (`NEXT_PHASE=phase-production-build`) são ignoradas. As variáveis básicas (`NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`) continuam obrigatórias também no build.
2. **Scripts `tsx`.** Script que importa `@/server/*` com `server-only` roda com `tsx --conditions=react-server` (ex.: `email:test`). `admin:create` não importa esses módulos e cria o próprio `PrismaClient`.
3. **Serviço de pedidos** (`src/server/orders.service.ts`): `applyProviderStatus(ev, { now })`, `markRefunded(orderId, actorId, { now })`, `getOrderPublic(id, token, { now })`; `cancelOrder`, `markRefunded` e `applyProviderStatus` devolvem `{ changed, status }`; pedido inexistente lança `NotFoundError`; produto inexistente ou inativo lança `ValidationError` (422). `CreatedOrder` é `{ order, product, contributor, payment }` e o `contributor` vem sem CPF: a rota usa o CPF do input validado ou `decryptCpf`. `createOrder` expira reservas vencidas dentro da própria transação. A função `approve(orderId)` citada em [[fluxos/pagamento-pix]] não existe; é `applyProviderStatus`.
4. **Erros.** `AppError(code, message, status)` em `src/server/errors.ts`. Auditoria em `src/server/audit.ts`: `AuditLog` não tem `orderId` (vai em `target`) e chaves sensíveis são descartadas do `meta`.
5. **Auth.** `Session` tem `userId`/`user` (não `adminId`) e não guarda `lastSeenAt`, `ip` nem `userAgent`. "Admin ativo" é `disabledAt === null`. `authErrorResponse(error)` e o `rateLimit` local de `login/route.ts` são provisórios: a T08 cria `src/server/http.ts` e `src/server/rate-limit.ts` e deve trocá-los. `admin:create` não aceita senha por argumento; senha vinda do ambiente grava `mustChangePassword = true`.
6. **E-mail.** `sendEmail<T>(template, to, data)` tipado por template; logo em `public/images/benjamim.png`; cada template aceita `siteUrl` opcional.
7. **Testes de integração.** `.env.test` é versionado (só valores fixos de teste) e o setup recusa rodar fora de `localhost:5443/test`. Arquivos rodam em série. Helpers em `tests/integration/db.ts` (`testPrisma`, `truncateAll`, `seedCatalog`).
8. **Gateways** (`src/server/gateways/`): `getGateway()` exige gateway configurado; `getGatewayById(id)` não (serve a webhook e estorno de pedidos antigos). `CreateChargeInput.product.unitCents`. No Mercado Pago, o webhook do tópico `order` devolve `ref.providerOrderId` e o do tópico `payment` devolve `ref.providerPaymentId`: a rota passa o `ref` inteiro a `fetchStatus` e localiza o pedido por `externalReference`. `verifyWebhook` exige `x-request-id` e nunca lê status do corpo. Cobrança criada pela Orders API é estornada por `POST /v1/orders/{id}/refund`. Order que volta em `processing` sem QR lança `GATEWAY_ERROR`: quem chama cancela o pedido. Nada foi testado contra o sandbox; a lista do que conferir está em [[integracoes/mercado-pago]].
9. **API pública** (T08): respostas por `json`/`fail` de `src/server/http.ts`; limites em `src/server/rate-limit.ts` (`rateLimit(key, { limit, windowMs })` devolve `{ ok, retryAfterSec }`). Conflito de números responde `{ code: 'NUMBERS_TAKEN', message, numbers }`; validação responde `VALIDATION_ERROR`; erro interno é `INTERNAL`. `src/server/payment-sync.ts` concentra `handleWebhook(gatewayId, req)` e `refreshPendingOrder(orderId, now)`. Reenvio de `idempotencyKey` de pedido cancelado ou vencido responde 409 `ORDER_NOT_PAYABLE`: o cliente gera nova chave depois de erro de gateway. O e-mail de pedido confirmado está como `TODO(T18)` em `payment-sync.ts` e em `demo/aprovar`.
10. **Senha e convite** (T16): `issueToken(adminId, kind, ttlMs, tx?)`, `consumeToken`/`peekToken(raw, kind, tx?)` lançam `AppError('TOKEN_INVALID', ..., 400)`; `inviteAdmin({ name, email, role }, invitedBy)` e `resendInvite(adminId, by)` devolvem `{ admin, emailSent }`. `GET /api/admin/auth/token/[token]` tem limite de 5 por 15 min por IP e depende de `Referer`: página em Server Component deve chamar `peekToken` direto.
11. **Limitador duplicado.** As rotas de `src/app/api/admin/auth/*` (T14, T16) ainda têm `rateLimit` e resposta de erro locais; a T22 troca pelos módulos de `src/server/http.ts` e `src/server/rate-limit.ts`.
12. **Testes nunca falam com serviço real.** `tests/integration/test-env.ts` deixa vazias as variáveis de SMTP, gateways e admin inicial que o `.env.test` não define, e `vitest.config.ts` faz o mesmo com SMTP. Motivo: o Prisma Client carrega o `.env` local sem sobrescrever, e em 2026-10-09 duas execuções de teste da T16 tentaram enviar cerca de 13 e-mails pelo SMTP real para endereços inexistentes `@fluxos.local`.

## Decisão do dono (pendente, não bloqueia)
- **Pix pago depois do prazo.** Hoje, pagamento aprovado que chega com a reserva de 10 minutos vencida não aprova o pedido: fica `EXPIRED`, os números são liberados, grava `order.paid_after_expiry` e o estorno é manual. É o texto literal da T06. Alternativa: tolerância de alguns minutos para aviso atrasado, se os números ainda estiverem livres.
- **Vencimento do Pix no Mercado Pago: mínimo de 30 minutos.** A reserva local dos números é de 10 minutos, mas o Mercado Pago não aceita Pix com vencimento menor que 30. Entre o minuto 10 e o 30 o contribuinte ainda consegue pagar um pedido cujos números já foram liberados, e cai na regra acima (estorno manual). Opções: (a) subir a reserva para 30 minutos; (b) manter 10 e aprovar o pagamento atrasado quando os números ainda estiverem livres; (c) manter como está. Recomendação do orquestrador: (a).
- **Preço e total de números fixos no código.** A validação usa as constantes do domínio (R$ 0,50 e 5.000), não `Product.unitCents` nem `Campaign.totalNumbers`. Editar esses campos no painel não muda a regra.
- **Senha inicial do admin.** O `ADMIN_BOOTSTRAP_PASSWORD` do `.env` local não atende à política (10+ caracteres, letra e número), então `npm run admin:create` recusa e o OWNER ainda não existe no banco de desenvolvimento. O dono precisa trocar o valor no `.env` e rodar o comando.

## Consequências
- `npm run build` funciona na máquina de desenvolvimento com o `.env` de demonstração; subir o servidor em produção com esse `.env` continua sendo recusado.
- T22 revisa: IP do rate limit vem de `x-forwarded-for` (confiável só atrás do Caddy); `MAIL_FROM` opcional em produção.
