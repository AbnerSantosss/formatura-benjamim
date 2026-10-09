---
tipo: arquitetura
atualizado: 2026-10-09
tags: [stack, nextjs, react, typescript]
---

# Stack

| Camada | Hoje (após T23) | Observação |
|---|---|---|
| Framework | Next.js 16.4.0, App Router, servidor Node com `output: 'standalone'` | export estático removido na T01 |
| UI | React 19.3, CSS puro em `src/app/*.css`, Lucide, fontes Nunito/Caveat | não usar Tailwind; o visual já foi aprovado |
| Linguagem | TypeScript 6.0.3 strict | |
| Dados | PostgreSQL 16 + Prisma 6.19.3 | `localStorage` e `sessionStorage` foram removidos |
| Validação | Zod 4.6.5 (`src/domain/validation.ts`) | |
| Auth | sessão em banco, bcrypt, cookie HttpOnly | sem NextAuth ([[decisoes/005-autenticacao-propria]]) |
| Pagamento | Mercado Pago (Pix), adapter não testado com credenciais reais; FastPay e IronPay são stubs; gateway `demo` só em dev | |
| E-mail | Nodemailer (SMTP) | |
| Testes | Vitest 5 (unitário e integração com banco) + Playwright 1.64 (E2E) | |
| Lint | ESLint 9 flat config (`eslint .`) | `next lint` não existe mais no Next 16 |
| Hospedagem | Docker Compose em VPS com Caddy para HTTPS (ver [[operacao/deploy]]) | a VPS ainda não foi configurada (T24) |

## Mudanças do Next 16 que afetam este projeto
Fonte: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.
- `middleware.ts` foi renomeado para `proxy.ts`; a função exportada chama `proxy`. Usar para proteger `/admin` (arquivo `src/proxy.ts`).
- `params`, `searchParams`, `cookies()`, `headers()` são **somente assíncronos** (`await`).
- `next lint` removido; `next build` não roda lint. O script `lint` já usa `eslint .`.
- Route Handlers (`route.ts`) suportam `GET/POST/...` com `Request` padrão. Por isso o projeto roda como servidor Node, sem export estático.
- `revalidateTag` exige segundo argumento (`cacheLife`). Para a landing usar `export const revalidate = 30` na página, que continua válido sem `cacheComponents`.
- Turbopack é o padrão de build.
- Node 22 é a versão do projeto (`Dockerfile` e CI). Node 24.19 também foi usado localmente.

Ver também [[arquitetura/arquitetura-alvo]], [[decisoes/004-stack-de-producao]].
