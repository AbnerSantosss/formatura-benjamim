---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, stack, postgres, prisma, docker]
---

# ADR 004 — Stack de produção: Next 16 + PostgreSQL + Prisma + Docker em VPS

**Status:** aceita em 2026-10-09.

## Opções consideradas
| Opção | Prós | Contras |
|---|---|---|
| Manter estático + serviço externo (Supabase + edge functions) | sem servidor próprio | duas bases de código, webhooks fora do Next, mais contas para gerir |
| **Next 16 full-stack + Postgres + Docker em VPS** | um único deploy, Route Handlers para webhooks, controle total, barato | precisa de VPS (Hostinger/Contabo/Hetzner) e HTTPS |
| Vercel + Neon | zero ops | cold start em webhooks, limite de função, duas contas; fica como alternativa documentada |
| SQLite | simples | concorrência fraca para reserva de números, backup manual |

## Decisão
- Remover `output: 'export'`; Next 16 roda como servidor Node (`next start`) com `output: 'standalone'` para a imagem Docker ficar pequena.
- PostgreSQL 16 em container ao lado, volume persistente, backup diário por `pg_dump` em cron do host.
- Prisma 6 como ORM e migrações. Índice único parcial criado via SQL dentro da migração ([[arquitetura/modelo-de-dados-alvo]]).
- Caddy como reverse proxy com HTTPS automático (Let's Encrypt). Alternativa: Nginx + certbot.
- Variáveis de ambiente validadas por Zod em `src/server/env.ts` no boot; faltar variável obrigatória derruba o processo com mensagem clara.
- Vercel + Neon fica documentado em [[operacao/deploy]] como caminho B (mesmo código, sem Docker).

## Consequências
- `.openai/hosting.json` (estático) deixa de valer; pode ser removido ou mantido com comentário.
- `npm run build` passa a exigir `DATABASE_URL` apenas em runtime, não no build (Prisma Client é gerado no build sem conectar).
- Testes de integração usam um Postgres descartável via `docker compose -f docker-compose.test.yml`.

Relacionado: [[arquitetura/stack]], [[operacao/deploy]].
