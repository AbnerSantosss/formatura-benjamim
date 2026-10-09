---
tipo: decisao
atualizado: 2026-10-09
tags: [decisao, dependencias, seguranca, prisma]
---

# 013 — `overrides` do npm para `deepmerge-ts` 8

## Contexto
O critério de aceite da [[plano/tarefas/T22-seguranca]] exige `npm audit --omit=dev --audit-level=high` sem alta nem crítica. O comando acusava 3 altas, todas a mesma origem: `deepmerge-ts` 7.1.5 (GHSA-ggr8-5vv4-36mx), trazido por `prisma` 6.19.3 → `@prisma/config`. O pacote é usado pela linha de comando do Prisma para ler configuração, não pelo caminho das requisições. A correção oferecida pelo npm (`npm audit fix --force`) rebaixaria o Prisma para 6.12.0.

## Decisão
Tomada pelo orquestrador (não envolve dinheiro, dados pessoais nem mudança visual): `package.json` ganhou `"overrides": { "deepmerge-ts": "^8.0.2" }`. A versão 8 publica CommonJS e ESM e aceita Node 16.9 ou mais novo (o Dockerfile usa Node 22).

Conferido depois do override: `npm audit --omit=dev --audit-level=high` sem vulnerabilidades, `npx prisma validate`, `npx prisma migrate status`, `npm run test:integration` (129, aplica as migrações no banco de teste), `npm run test:e2e` (11) e `npm run build`.

## Consequências
- `npx prisma generate` e `prisma migrate deploy` dentro da imagem Docker não foram executados com o override; conferir na primeira construção da imagem ([[plano/tarefas/T24-deploy]]).
- Ao atualizar o Prisma para uma versão que já dependa de `deepmerge-ts` 8, remover o bloco `overrides`.
- `npm audit` completo (com dependências de desenvolvimento) ainda lista altas; ficam fora do critério porque não vão para o servidor.
