---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-5, sorteio, opus]
---

# T20 — Sorteio: domínio, serviço, API e botão "Gerar ganhador"

- **Modelo:** opus.
- **Depende de:** T18, T19.
- **Arquivos:** (criar) `src/domain/draw.ts`, `src/server/draw.service.ts`, `src/app/api/admin/sorteio/route.ts`, `src/app/api/admin/sorteio/anular/route.ts`, `tests/domain/draw.test.ts`, `tests/integration/draw.test.ts`; (substituir) `src/components/admin/draw-card.tsx`.
- **Ler antes:** [[fluxos/sorteio]], [[decisoes/006-sorteio-por-csprng-auditavel]].

## Passos
1. `src/domain/draw.ts` (puro, pode usar `node:crypto` para hash, nunca Prisma):
   ```ts
   export type Participant = { number: number; orderId: string };
   export function participantsHash(list: Participant[]): string
   // sha256 da lista ORDENADA por number, linhas `${number}:${orderId}` unidas por '\n'
   export function pickWinner(list: Participant[], randomInt: (maxExclusive: number) => number):
     { winner: Participant; index: number; hash: string; eligibleCount: number }
   // lança DrawError('NO_PARTICIPANTS') se vazio
   ```
2. `draw.service.ts`:
   - `getDrawState(now)`: `{ drawAt, canDraw: drawAt != null && now >= drawAt, current: Draw | null (com vencedor: número, nome, e-mail, telefone, orderId), eligibleCount }`.
   - `performDraw({ actorId, role, force, now })`: em `$transaction` com `SELECT ... FOR UPDATE` na `Campaign` (serializa chamadas concorrentes): se já existe `Draw` não anulado → 409 `DRAW_EXISTS`; se `!canDraw && !force` → 409 `DRAW_NOT_YET`; se `force && role !== 'OWNER'` → 403; carregar participantes (`OrderNumber.active = true` e `Order.status = APPROVED`); `seedHex = randomBytes(32)`; `pickWinner(list, max => randomInt(0, max))`; gravar `Draw { eligibleCount, participantsHash, seedHex, winnerNumber, winnerOrderId, drawnById, drawnAt, forced }`; `audit('draw.performed', { meta: { forced, eligibleCount, winnerNumber } })`. Após o commit: `sendEmail('ganhador', winner.email, ...)` e `sendEmail('sorteio-realizado')` para todos os admins ativos.
   - `annulDraw({ actorId, role, reason })`: OWNER apenas; `reason` ≥ 10 caracteres; marca `annulledAt`, `annulledById`, `notes`; audit. (Campos já criados na T03.)
3. Rotas: `GET /api/admin/sorteio` → `getDrawState`; `POST /api/admin/sorteio` `{ force?: boolean }` → `performDraw`; `POST /api/admin/sorteio/anular` `{ reason }`. Todas com `requireAdmin` + `assertSameOrigin`.
4. Conferir que `getCampaignSummary` (T06) devolve `winner = { number, firstName }` quando `Campaign.drawPublic` e há `Draw` não anulado; se a T06 deixou pendente, implementar agora.
5. `draw-card.tsx` (Client, substitui o placeholder da T19): mostra data, contagem regressiva, `eligibleCount`, botão **Gerar ganhador** desabilitado antes de `drawAt` (tooltip "Disponível em …"); para OWNER, checkbox "Sei que ainda não é a data e quero sortear agora" que habilita o botão com `force`; clique abre `confirm-dialog` ("Esta ação sorteia o ganhador entre N números e não pode ser desfeita sem anulação registrada. Continuar?"); resultado exibido no card com número, nome, e-mail, WhatsApp, hash e data; botão "Anular sorteio" (OWNER) com motivo obrigatório.
6. Testes de domínio: hash igual para listas em ordens diferentes; `pickWinner` devolve o índice do `randomInt` injetado; lista vazia lança. Integração: sorteio antes da data sem `force` → 409; com `force` por ADMIN → 403; por OWNER → cria `Draw`; segundo sorteio → 409; anular e sortear de novo funciona; só números APPROVED participam (criar um PENDING e um REFUNDED e garantir que `eligibleCount` não os conta e que o vencedor é sempre de pedido APPROVED em 20 execuções); duas chamadas concorrentes criam **um** sorteio.

## Critério de aceite
```
docker compose -f docker-compose.test.yml up -d && npm run test:integration
npm run typecheck && npm run lint && npm test && npm run build
```
Manual: configurar `drawAt` no passado → botão habilita → gerar → ver resultado e e-mails no Mailpit.

## Não fazer
- Não usar `Math.random`.
- Não expor dados do ganhador além do primeiro nome e número fora do painel.
- Não permitir dois sorteios válidos ao mesmo tempo.

## Desvios registrados
- O modelo `Draw` real não tem `forced`, `drawnById` nem `drawnAt` (os campos são `performedById` e `performedAt`). Sem migração nova: a marca de sorteio antecipado fica em `AuditLog.meta.forced` de `draw.performed`, e o painel lê de lá. O ADR 006 e [[fluxos/sorteio]] ainda citam os nomes antigos.
- Ordem das checagens em `performDraw`: `DRAW_EXISTS` (409), `DRAW_NOT_YET` (409), `force` por quem não é OWNER (403). `forced` gravado é "ainda não era a data", então `force: true` depois da data não marca como antecipado. Sem `drawAt`, só OWNER com `force` sorteia.
- Códigos além do texto: `NO_PARTICIPANTS` (409), `NO_ACTIVE_DRAW` (409) e `DrawError('INVALID_INDEX')` no domínio.
- Respostas: `GET /api/admin/sorteio` → `{ state }`; `POST` → `{ state, emails: { winnerSent, adminsSent, adminsTotal } }`; `POST .../anular` → `{ state }`. O GET também passa por `assertSameOrigin`, como o passo 3 pede (os outros GET do painel só usam `requireAdmin`).
- Se o e-mail do ganhador falhar, o sorteio vale e o card avisa para contatar por WhatsApp ou e-mail. Não há reenvio.
- Motivo da anulação: 10 a 500 caracteres, gravado só em `Draw.notes` (fora do `AuditLog`, por ser texto livre). O ganhador não é avisado da anulação.
- Papel ADMIN: sorteia depois da data, vê o resultado completo, não antecipa nem anula.
- Passo 4: `getCampaignSummary` já devolvia o ganhador (primeiro nome e número) com `drawPublic`; só ganhou teste de integração.
- `confirm-dialog.tsx` ganhou a prop opcional `confirmDisabled`.
- O `grep "Math.random"` do "Não fazer" acha 2 usos antigos fora do sorteio: `src/domain/orders.ts:30` (escolha aleatória de números no checkout) e um identificador em `tests/integration/auth-flows.test.ts`. O sorteio usa só `node:crypto`.
- Teste manual não cobriu: alterar `drawAt` pela tela de Configurações (foi direto no banco), `drawPublic` na landing pelo navegador e o HTML dos e-mails (só assunto e destinatário no Mailpit).
- Sem tratamento: pedido vencedor estornado depois do sorteio continua como ganhador até alguém anular.
