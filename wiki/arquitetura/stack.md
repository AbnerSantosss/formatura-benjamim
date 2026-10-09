---
tipo: arquitetura
atualizado: 2026-10-09
tags: [stack, nextjs, react, typescript]
---

# Stack

| Camada | Hoje (protótipo) | Produção (alvo) |
|---|---|---|
| Framework | Next.js 16.4.0, App Router, `output: 'export'` | Next.js 16.4.0, servidor Node (sem export) |
| UI | React 19.3, CSS puro em `src/app/*.css`, Lucide, fontes Nunito/Caveat | igual (não trocar para Tailwind; o visual já foi aprovado) |
| Linguagem | TypeScript 6.0.3 strict | igual |
| Dados | `localStorage` + `sessionStorage` | PostgreSQL 16 + Prisma |
| Validação | funções manuais em `demo-model.ts` | Zod (`src/domain/validation.ts`) |
| Auth | usuário/senha fixos no cliente | sessão em banco, bcrypt, cookie HttpOnly |
| Pagamento | simulado | Mercado Pago (Pix) + stubs FastPay / IronPay |
| E-mail | nenhum | Nodemailer (SMTP) |
| Testes | `node --test` em `tests/demo.test.mjs` (12 testes) | Vitest (unit + integração com banco) + Playwright (smoke) |
| Lint | ESLint 9 flat config (`eslint .`) | igual (`next lint` não existe mais no Next 16) |
| Hospedagem | `.openai/hosting.json` (estático) | Docker Compose em VPS (ver [[operacao/deploy]]) |

## Mudanças do Next 16 que afetam este projeto
Fonte: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.
- `middleware.ts` foi renomeado para `proxy.ts`; a função exportada chama `proxy`. Usar para proteger `/admin`.
- `params`, `searchParams`, `cookies()`, `headers()` são **somente assíncronos** (`await`).
- `next lint` removido; `next build` não roda lint. O script `lint` já usa `eslint .`.
- Route Handlers (`route.ts`) suportam `GET/POST/...` com `Request` padrão; com `output: 'export'` só `GET` estático funciona. Por isso o export precisa ser removido.
- `revalidateTag` exige segundo argumento (`cacheLife`). Para a landing usar `export const revalidate = 30` na página, que continua válido sem `cacheComponents`.
- Turbopack é o padrão de build.
- Node 24.19 instalado localmente; Docker 29 disponível.

Ver também [[arquitetura/arquitetura-alvo]], [[decisoes/004-stack-de-producao]].
