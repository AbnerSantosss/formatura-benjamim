---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-0, env, zod]
---

# T04 — Variáveis de ambiente validadas (`src/server/env.ts`)

- **Modelo:** opus.
- **Depende de:** T00.
- **Arquivos (criar):** `src/server/env.ts`, `tests/env.test.ts`, `tests/stubs/server-only.ts`; (alterar) `vitest.config.ts`.
- **Ler antes:** [[operacao/variaveis-de-ambiente]].

## Passos
1. `npm install zod`.
2. Criar `src/server/env.ts` com `import 'server-only'` e um schema Zod com **todas** as variáveis da tabela em [[operacao/variaveis-de-ambiente]]. Regras:
   - `NODE_ENV`: enum `development | test | production`, padrão `development`.
   - `NEXT_PUBLIC_SITE_URL`: `z.string().url()`.
   - `DATABASE_URL`: string não vazia.
   - `AUTH_SECRET`, `CPF_ENCRYPTION_KEY`: `z.string().regex(/^[0-9a-f]{64}$/)` (32 bytes hex). Em `development`/`test`, se ausentes, usar um valor fixo de desenvolvimento e imprimir aviso uma vez; em `production`, falhar.
   - `PAYMENT_GATEWAY`: enum `mercadopago | fastpay | ironpay | demo`.
   - `DEMO_MODE`: `z.enum(['true','false']).default('false')` transformado em boolean.
   - Opcionais: `MP_*`, `FASTPAY_*`, `IRONPAY_*`, `SMTP_*`, `MAIL_*`, `CRON_SECRET`, `LOG_LEVEL`.
   - `MP_API_FLAVOR`: enum `orders | payments`, padrão `orders`.
3. Depois do `parse`, aplicar `superRefine` com as regras fail-closed:
   - `NODE_ENV === 'production' && DEMO_MODE === true` → erro "DEMO_MODE não pode ser true em produção".
   - `NODE_ENV === 'production' && PAYMENT_GATEWAY === 'demo'` → erro.
   - `PAYMENT_GATEWAY === 'mercadopago'` e falta `MP_ACCESS_TOKEN` ou `MP_WEBHOOK_SECRET` → **aviso** em dev (o adapter responderá "não configurado"); em produção, erro.
   - `NODE_ENV === 'production'` e falta `SMTP_HOST` → erro.
4. Exportar `export const env = parseEnv(process.env)` e também `export function parseEnv(raw: NodeJS.ProcessEnv)` para testes. Em caso de erro, lançar `Error` com a lista de problemas formatada (`issues.map(i => i.path.join('.') + ': ' + i.message)`), sem imprimir valores.
5. Exportar helper `export const isDemo = env.DEMO_MODE && env.NODE_ENV !== 'production'`.
6. Como `server-only` quebra no Vitest, criar `tests/stubs/server-only.ts` com `export {};` e em `vitest.config.ts` adicionar `resolve: { alias: { 'server-only': path.resolve('tests/stubs/server-only.ts'), '@': path.resolve('src') } }`.
7. Criar `tests/env.test.ts` cobrindo: env mínimo de dev passa; produção com `DEMO_MODE=true` falha; produção com gateway `demo` falha; `AUTH_SECRET` com 10 caracteres falha em produção; `MP_API_FLAVOR` padrão é `orders`.

## Critério de aceite
```
npm run typecheck && npm run lint && npm test
grep -n "DEMO_MODE não pode" src/server/env.ts
```

## Não fazer
- Não ler `process.env` em nenhum outro arquivo de servidor a partir daqui; tudo passa por `env`.
- Não imprimir valores de variáveis em logs ou erros.
