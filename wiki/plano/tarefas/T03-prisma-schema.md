---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-0, prisma, banco]
---

# T03 — Prisma: schema, migração inicial, índice parcial e seed

- **Modelo:** opus.
- **Depende de:** T00. (Precisa de um Postgres rodando: `docker compose up -d db` ou um local.)
- **Arquivos (criar):** `prisma/schema.prisma`, `prisma/migrations/<timestamp>_init/migration.sql`, `prisma/seed.ts`, `src/server/db.ts`; (alterar) `package.json`, `.env.example` (nada de segredo).
- **Ler antes:** [[arquitetura/modelo-de-dados-alvo]] inteiro (o schema está lá), [[decisoes/002-produto-antes-do-gateway]].

## Passos
1. `npm install @prisma/client@^6 && npm install -D prisma@^6`. Confirmar que `npx prisma --version` começa com 6.
2. `npx prisma init --datasource-provider postgresql` (se já existir `prisma/`, pular). Garantir que `.env` tem `DATABASE_URL` apontando para o Postgres de dev (`postgresql://benjamim:benjamim@localhost:5432/benjamim`).
3. Substituir `prisma/schema.prisma` pelo schema de [[arquitetura/modelo-de-dados-alvo]], sem alterar nomes de modelos, campos ou enums. Generator: `provider = "prisma-client-js"`. Acrescentar ao modelo `Payment` o campo `lastCheckedAt DateTime?` e ao modelo `Draw` os campos `annulledAt DateTime?` e `annulledById String?` (as tarefas T08 e T20 usam).
4. `npx prisma migrate dev --name init --create-only`. Abrir o `migration.sql` gerado e **acrescentar ao final**:
   ```sql
   -- Um número só pode estar ativo em um pedido por vez.
   CREATE UNIQUE INDEX "OrderNumber_number_active_unique" ON "OrderNumber"("number") WHERE "active";
   CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
   CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
   ```
   (Se o schema já tiver `@@index` equivalentes aos dois últimos, não duplicar.)
5. `npx prisma migrate dev` (aplica). Depois `npx prisma generate`.
6. Criar `src/server/db.ts`:
   ```ts
   import 'server-only';
   import { PrismaClient } from '@prisma/client';
   const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
   export const prisma =
     globalForPrisma.prisma ??
     new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
   if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
   ```
   Instalar `npm install server-only`.
7. Criar `prisma/seed.ts` que, de forma idempotente (`upsert`):
   - cria `Campaign` id `main` com `goalCents = Number(process.env.CAMPAIGN_GOAL_CENTS ?? 2500000)`, `costsCents = Number(process.env.CAMPAIGN_COSTS_CENTS ?? 0)`, `totalNumbers = 5000`, `numberUnitCents = 50`, `reservationMin = 10`, `instagramFatherUrl`/`instagramMotherUrl` do env (ou null), `drawPublic = false`;
   - cria `Product` `cestas-boticario` (title "Cestas O Boticário", mode NUMBERS, unitPriceCents 50, sortOrder 1, active true) e `colaboracao-avulsa` (title "Colaboração avulsa", mode EXTRA, unitPriceCents 0, sortOrder 2, active true). Textos de descrição: copiar de `src/components/product-catalog.tsx`.
8. No `package.json` adicionar:
   ```json
   "db:migrate": "prisma migrate deploy",
   "db:seed": "tsx prisma/seed.ts",
   "db:studio": "prisma studio",
   "postinstall": "prisma generate"
   ```
   e a chave `"prisma": { "seed": "tsx prisma/seed.ts" }`.
9. Rodar `npm run db:seed` duas vezes; a segunda não pode falhar nem duplicar.
10. Teste do índice parcial (via `psql` ou `npx prisma db execute --stdin`): inserir dois `OrderNumber` com `number = 1` e `active = true` em pedidos diferentes deve falhar no segundo; com `active = false` no primeiro deve passar. Registrar o resultado no relatório.

## Critério de aceite
```
npx prisma validate
npx prisma migrate status
grep -n "OrderNumber_number_active_unique" prisma/migrations/*/migration.sql
npm run db:seed
npm run typecheck && npm run lint && npm test
```
`migrate status` deve dizer que o banco está atualizado.

## Não fazer
- Não alterar o schema da wiki sem registrar o motivo em uma seção "## Desvios registrados" ao fim deste arquivo.
- Não usar `prisma db push` (precisa de migração versionada).
- Não gravar `DATABASE_URL` real no `.env.example`.
