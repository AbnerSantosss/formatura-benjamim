---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-5, api, admin]
---

# T18 — API do painel (`/api/admin/**`)

- **Modelo:** opus.
- **Depende de:** T06, T07, T14, T15.
- **Arquivos (criar):** `src/server/admin.service.ts`, `src/app/api/admin/metricas/route.ts`, `pedidos/route.ts`, `pedidos/[id]/route.ts`, `pedidos/[id]/estornar/route.ts`, `pedidos/[id]/reenviar-email/route.ts`, `exportar.csv/route.ts`, `produtos/route.ts`, `produtos/[id]/route.ts`, `configuracoes/route.ts`, `usuarios/route.ts`, `usuarios/[id]/route.ts`, `usuarios/[id]/reenviar-convite/route.ts`, `expirar/route.ts`, `tests/integration/admin-api.test.ts`.
- **Ler antes:** [[fluxos/backoffice]], [[plano/tarefas/T08-rotas-api-publicas]] (padrões `json/fail`), [[plano/tarefas/T14-auth-base]] (`requireAdmin`, `assertSameOrigin`).

## Regras comuns
- Toda rota: `const { admin } = await requireAdmin();` no início. Mutáveis: `assertSameOrigin(req)`. Erros via `fail`.
- CPF sai sempre como `cpfMasked = '***.***.***-' + cpfLast4`. Nunca `cpfCipher` nem CPF em claro, nem no CSV.
- Datas ISO UTC; o cliente formata em `America/Fortaleza`.

## Passos
1. `admin.service.ts`: `listOrders({ q, status, mode, page, pageSize })` (busca em nome, e-mail, `cpfLast4`, `id`, número exato, valor em centavos), `getOrder(id)`, `metrics()` (reutiliza `getCampaignSummary` + contagens por status + últimos 7 dias), `exportOrdersCsv(filters)` (colunas: id, data, nome, e-mail, telefone, cpf_mascarado, produto, modo, valor, status, numeros), `updateProduct`, `getSettings`/`updateSettings` (Zod: `goalCents`, `costsCents` inteiros ≥ 0; `drawAt` ISO ou null; `drawPublic` boolean; URLs Instagram `url().optional()`; `publicMessage` ≤ 500), `listAdmins`, `deactivateAdmin(id, by)` (OWNER apenas; não permitir desativar a si mesmo nem o último OWNER ativo).
2. Rotas:
   - `GET metricas` → `metrics()`.
   - `GET pedidos?q&status&mode&page` → `{ items, page, pageSize, total }`.
   - `GET pedidos/[id]` → detalhe com números, payment (sem `rawCreate`), auditoria do pedido.
   - `POST pedidos/[id]/estornar` → exige `status APPROVED`; `getGatewayById(order.gateway).refund(ref)`; se `ok`, `markRefunded(id, admin.id)`; devolve o pedido. Em `isDemo`, o gateway demo sempre retorna ok.
   - `POST pedidos/[id]/reenviar-email` → `sendEmail('pedido-confirmado')` se APPROVED.
   - `GET exportar.csv?...` → `text/csv; charset=utf-8` com BOM e `Content-Disposition: attachment; filename="pedidos.csv"`.
   - `GET/PATCH produtos`, `PATCH produtos/[id]` (`title`, `description`, `active`; `unitPriceCents` só se nenhum pedido aprovado do produto).
   - `GET/PATCH configuracoes` (o GET inclui `gateways: gatewayHealth()`).
   - `GET usuarios`, `POST usuarios` (`inviteAdmin` da T16), `PATCH usuarios/[id]` (`{ active: false }`), `POST usuarios/[id]/reenviar-convite`.
   - `POST expirar` → `expireStaleOrders(new Date())`.
3. Substituir o `// TODO(T18): e-mail` dos webhooks e do `demo/aprovar` (T08) por `sendEmail('pedido-confirmado', ...)` quando `changed && status === 'APPROVED'`, sempre **fora** da transação.
4. Testes de integração (com admin logado via cookie): sem cookie 401; lista pagina e filtra; CSV não contém 11 dígitos seguidos; estorno em demo marca REFUNDED e libera números; configurações rejeitam `goalCents` negativo; ADMIN não desativa OWNER (403); último OWNER não pode ser desativado.

## Critério de aceite
```
docker compose -f docker-compose.test.yml up -d && npm run test:integration
npm run typecheck && npm run lint && npm test && npm run build
grep -rn "cpfCipher" src/app/api/admin ; echo "(esperado: nada)"
grep -rn "TODO(T18)" src/ ; echo "(esperado: nada)"
```

## Não fazer
- Não expor `rawCreate`, `cpfCipher`, `passwordHash`, `tokenHash` em nenhuma resposta.
- Não permitir mudar status de pedido manualmente além de estornar.

## Desvios registrados
- 2026-10-09: o campo de preço do produto é `Product.unitCents` (não `unitPriceCents`), e a campanha única tem id `main`. Ver [[decisoes/009-ajustes-de-consistencia-do-schema]].
- (2026-10-09) `sendOrderConfirmedEmail(orderId)` fica em `payment-sync.ts` e é aguardada (não usa `after()`); webhook, `demo/aprovar` e reenviar-email a reutilizam. Nunca lança.
- (2026-10-09) Formato das respostas: `metricas` devolve o objeto direto; `pedidos` `{ items, page, pageSize, total }`; `pedidos/[id]` `{ order }`; estornar `{ changed, order }`; reenviar-email `{ emailSent }`; produtos `{ items }`/`{ product }`; configurações `{ settings, gateways }`; usuários `{ items }`, `{ admin, emailSent }`, `{ admin }`; expirar `{ expired }`. Erros `{ code, message }`.
- (2026-10-09) CSV com `;`, aspas em todas as células, `\r\n`, BOM, data em horário de Fortaleza, valor em reais, telefone formatado e prefixo `'` contra fórmula.
- (2026-10-09) PENDING vencido aparece como EXPIRED em lista, detalhe e CSV. `publicToken` vai na lista e no detalhe do admin para abrir `/pagamento/[id]?t=`.
- (2026-10-09) Extras: reativar admin (`PATCH usuarios/[id] { active: true }`, só OWNER); só OWNER convida OWNER; limite de 3 reenvios a cada 10 min; `PATCH produtos` na coleção aceita `{ id, ...campos }`; preço trava com `PRODUCT_PRICE_LOCKED` se houver pedido aprovado.
- (2026-10-09) Estorno exige APPROVED com referência do provedor; pedido pago após o prazo continua manual (ADR 010).
