---
tipo: arquitetura
atualizado: 2026-10-09
tags: [modelo, demo, localstorage]
---

# Modelo de dados atual (`src/lib/demo-model.ts`)

Tudo roda no navegador. Chave do localStorage: `benjamim.frontend-demo.v1`. Sessão admin: `sessionStorage` `benjamim.frontend-demo.session` = `'demo'`.

## Constantes
- `TOTAL_NUMBERS = 5000`, `NUMBER_UNIT_CENTS = 50` (R$ 0,50 por número, logo R$ 5 = 10 números).
- Pacotes: 500, 1000, 2500, 5000 centavos (10/20/50/100 números). Outros múltiplos de R$ 5 aceitos.
- Reserva: 10 minutos (`expiresAt = createdAt + 600000`).

## Tipos
- `DemoProduct { id, title, mode: 'numbers'|'extra', description, unitPrice }`. Catálogo fixo: `cestas-boticario` e `colaboracao-avulsa`.
- `DemoPayment { id: 'demo-<uuid>', amount, createdAt, expiresAt, status, mode, productId, numbers[] }`.
- `DemoStatus = pending | approved | expired | refunded`.

## Regras que DEVEM ser preservadas na produção
- `numberAllowance(amount)`: só múltiplos de 500 centavos; retorna `amount / 50`.
- `validateOrder`: avulsa não tem números e aceita centavos a partir de R$ 5; números exigem quantidade exata, sem repetição, dentro de 1..5000.
- `effectiveStatus`: pendente vira expirado quando `now >= expiresAt` (expiração "preguiçosa", sem cron).
- `occupiedNumbers`: números de pedidos `pending` (não expirados) ou `approved`.
- `transition`: `pending -> approved|expired`, `approved -> refunded`; aprovar revalida disponibilidade; qualquer outra transição é ignorada (idempotente).
- `demoTotals`: só `approved` conta no arrecadado; `pending` separado; `refunded` separado.
- `randomAvailableNumbers`: Fisher-Yates parcial sobre a lista de livres.

Esses invariantes têm testes em `tests/demo.test.mjs`. O alvo move a lógica pura para `src/domain/` e mantém os testes ([[plano/tarefas/T05-dominio-puro]]).
