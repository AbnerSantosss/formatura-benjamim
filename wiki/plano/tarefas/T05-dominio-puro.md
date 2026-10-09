---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-1, dominio, validacao]
---

# T05 — Domínio puro: mover regras do protótipo e validação Zod

- **Modelo:** opus.
- **Depende de:** T00.
- **Arquivos:** (criar) `src/domain/orders.ts`, `src/domain/validation.ts`, `src/domain/money.ts`, `src/domain/types.ts`, `tests/domain/orders.test.ts`, `tests/domain/validation.test.ts`; (alterar) `src/lib/demo-model.ts` (vira re-export); (mover) `tests/demo.test.mjs` → `tests/domain/orders.test.ts`.
- **Ler antes:** [[arquitetura/modelo-de-dados-atual]] (regras que não podem mudar), `src/lib/demo-model.ts` inteiro.

## Passos
1. Criar `src/domain/types.ts` com os tipos de domínio independentes de Prisma: `OrderMode = 'NUMBERS' | 'EXTRA'`, `OrderStatus = 'PENDING' | 'APPROVED' | 'EXPIRED' | 'CANCELED' | 'REFUNDED'`, `ContributorInput { name, cpf, phone, email }`, `NewOrderInput { productId, mode, amountCents, numbers: number[], contributor, idempotencyKey }`.
2. Criar `src/domain/orders.ts` movendo de `demo-model.ts` **sem alterar comportamento**: constantes (`TOTAL_NUMBERS = 5000`, `NUMBER_UNIT_CENTS = 50`, `PACKAGE_CENTS = 500`, `RESERVATION_MINUTES = 10`, `SUGGESTED_AMOUNTS`), `numberAllowance`, `validateOrder` (adaptada para receber `occupied: Set<number>` e `product: { mode, active }`), `effectiveStatus`, `transition`, `randomAvailableNumbers`, `completeWithAvailable`, `formatNumber` (4 dígitos). Nenhuma referência a `window`, `localStorage` ou `Date.now()` sem parâmetro (`now: Date` sempre vem de fora).
3. Criar `src/domain/money.ts`: `formatBRL(cents: number): string` (usar `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`), `parseBRLToCents(input: string): number | null`.
4. Criar `src/domain/validation.ts` com Zod:
   - `cpfSchema`: string, remove não dígitos, 11 dígitos, rejeita sequências iguais (`00000000000`…), valida os dois dígitos verificadores (algoritmo padrão de módulo 11).
   - `phoneSchema`: remove não dígitos, 10 ou 11 dígitos, DDD entre 11 e 99.
   - `emailSchema`: `z.string().trim().toLowerCase().email().max(160)`.
   - `nameSchema`: trim, 3 a 120 caracteres, pelo menos duas palavras.
   - `contributorSchema`, `newOrderSchema` (`amountCents` inteiro positivo ≤ 10.000.000; `numbers` array de inteiros 1..5000 sem repetição; `idempotencyKey` uuid; `mode` enum).
   - Mensagens de erro em português.
5. Transformar `src/lib/demo-model.ts` em: `export * from '@/domain/orders'; export * from '@/domain/money';` mais o que os componentes ainda importam dele (ver com `grep -rn "demo-model" src/`). Nada pode quebrar nos componentes nesta tarefa.
6. Converter `tests/demo.test.mjs` em `tests/domain/orders.test.ts` importando de `@/domain/orders`; manter os 12 casos. O alias `@/` já foi configurado na T04; se a T04 ainda não rodou, adicionar `resolve.alias['@'] = path.resolve('src')` no `vitest.config.ts`.
7. Criar `tests/domain/validation.test.ts`: CPF válido com máscara passa; CPF `111.111.111-11` falha; CPF com dígito errado falha; telefone `(85) 99999-9999` passa; telefone 9 dígitos falha; e-mail com maiúsculas é normalizado; `numbers` com repetição falha; `numbers` com 5001 falha.

## Critério de aceite
```
npm run typecheck && npm run lint && npm test
test ! -f tests/demo.test.mjs && echo movido
grep -rn "localStorage\|window\." src/domain/ ; echo "(esperado: nada)"
```

## Não fazer
- Não mudar valores de constantes nem a regra `amount >= 500 && amount % 500 === 0`.
- Não tocar em componentes além do que o re-export exige.

## Desvios registrados
- 2026-10-09: `demo-model.ts` mantém as versões do protótipo das funções com formato próprio (status minúsculo, `now` em ms); o domínio ganhou `occupiedNumbers`, `assertNumbersAvailable`, `orderTotals` e a transição `PENDING → CANCELED`. Ver [[decisoes/009-ajustes-de-consistencia-do-schema]].
