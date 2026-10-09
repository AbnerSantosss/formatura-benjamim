# Segurança — resultado da revisão (T22)

Revisão feita em 2026-10-09, na branch `producao`. Nenhum segredo aparece nesta página.
Testes que sustentam os itens: `tests/security/headers.test.ts` (unitário),
`tests/security/api.int.test.ts` (integração) e `tests/server/client-ip.test.ts`.

## Cabeçalhos (`next.config.ts`)

Valem para todas as rotas (`/(.*)`):

| Cabeçalho | Valor |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |

- `'unsafe-eval'` entra em `script-src` só fora de produção (o React usa `eval` em desenvolvimento).
- CSP sem nonce: as páginas públicas ficam em cache, e nonce obrigaria a renderizar tudo a cada
  requisição. Por isso `'unsafe-inline'` em script e estilo.
- `/admin/**`, `/pagamento/**`, `/obrigado/**` e `/api/**` levam também
  `X-Robots-Tag: noindex, nofollow` e `Cache-Control: no-store`.
- `X-Powered-By` desligado (`poweredByHeader: false`).
- O Zod, no navegador, roda em modo `jitless` (`src/domain/validation.ts`): sem isso ele testa
  `new Function` e a CSP de produção registra uma violação no console do checkout.

**Ao integrar algo externo** (script de gateway, fonte, imagem de outro domínio, analytics): a CSP
vai bloquear até a origem ser acrescentada em `next.config.ts`. Hoje o checkout não carrega nada de
fora; o QR do Pix chega como `data:` ou imagem `https:`.

## IP do cliente e limites de tentativas

- Uma única função: `getClientIp` em `src/server/client-ip.ts`. Usa o **último** valor de
  `X-Forwarded-For`, validado como IP; ausente ou inválido vira a chave `desconhecido`.
  `X-Real-IP` não é lido.
- Motivo: em produção o app só é alcançado pelo Caddy (`docker-compose.yml`: `expose`, sem porta
  publicada). O Caddy 2 sem `trusted_proxies` troca o cabeçalho pelo IP de quem conectou; com
  `trusted_proxies`, acrescenta esse IP ao fim. Nos dois casos o último valor é o que o nosso proxy
  viu. O primeiro valor, usado antes, podia ser inventado pelo cliente para ganhar um limite novo.
- Limites em memória, todos em `src/server/rate-limit.ts` (`RATE_LIMITS`): criação de pedido 10/min
  por IP; leituras públicas; autenticação do painel 5 a cada 15 min por IP e por e-mail (login,
  esqueci-senha, redefinir, aceitar convite, conferência de link).
- **Cuidados de operação:**
  - nunca publicar a porta do app (`ports:`) em produção: sem proxy na frente, o cabeçalho é o que
    o cliente mandar;
  - se entrar um CDN ou outro proxy na frente do Caddy, configurar `trusted_proxies` no Caddyfile com
    as faixas dele; sem isso todos os visitantes dividem o IP do CDN e o limite de 10 pedidos/min
    vira global;
  - o contador é por processo: com mais de uma instância do app, cada uma conta separado.

## Checklist

| # | Item | Situação | Evidência |
|---|---|---|---|
| 1 | Rotas `/api/admin/**` exigem sessão; mutáveis conferem origem | OK | Todas as 15 rotas fora de `auth/` chamam `requireAdmin`; todas as mutáveis chamam `assertSameOrigin`. Em `auth/`, as rotas públicas por natureza (login, esqueci-senha, redefinir, aceitar-convite, token) conferem origem e têm limite; `me` e `trocar-senha` exigem sessão. Testes: 401 sem cookie e 403 com `Origin` estranho. |
| 2 | Rota pública não aceita status nem valor de confirmação | OK | `src/app/api/pedidos/route.ts:51` (só campos do schema); `pedidos/[id]/status` só lê; aprovação só por `applyProviderStatus` a partir do provedor. |
| 3 | Webhook valida assinatura antes de ler o corpo | OK | `src/server/gateways/mercadopago.ts:396` (HMAC em tempo constante) antes de `:407` (`JSON.parse`); `src/server/payment-sync.ts:144` responde 401 e só depois grava `WebhookEvent` (`:149`); repetição cai em `P2002` (`:154`). FastPay e IronPay não estão implementados: `verifyWebhook` devolve `not-implemented` e a rota responde 503 sem processar. |
| 4 | Demonstração impossível em produção | OK | `src/server/env.ts:113` e `:121` recusam `DEMO_MODE=true` e gateway `demo`; `isDemo` (`:215`) é falso em produção; `src/app/api/demo/aprovar/route.ts:17` responde 404. Conferido no servidor de produção local: 404. |
| 5 | CPF só cifrado; `decryptCpf` fora das rotas | OK | `src/server/orders.service.ts:209`; `decryptCpf` só existe em `src/server/crypto.ts:22`, sem chamadas. Painel e CSV usam `cpfLast4` mascarado. |
| 6 | Logs sem dado pessoal | OK, com ressalva | `logError` grava só código ou nome da classe do erro (`src/server/http.ts`). Ressalva: `src/server/email/send.ts:71`, só com `NODE_ENV=development` e sem SMTP, imprime o texto do e-mail no terminal (pode conter link de convite ou de redefinição). Não acontece em produção. |
| 7 | `publicToken` comparado em tempo constante | OK | `src/server/orders.service.ts:448-449`. |
| 8 | Limite em login, esqueci-senha e criação de pedido | Corrigido | Limitadores duplicados das rotas de auth unificados em `src/server/rate-limit.ts`; IP passou a vir do último valor de `X-Forwarded-For`. |
| 9 | Cookie `HttpOnly`, `Secure` em produção, `SameSite=Lax` | OK | `src/server/auth/session.ts:51-53`. |
| 10 | `Session` e `AuthToken` guardam só hash | OK | `src/server/auth/session.ts:44`, `src/server/auth/tokens.ts:38`. |
| 11 | `mustChangePassword` bloqueia o painel | OK | `src/server/auth/require-admin.ts:23` (403 nas APIs) e `src/app/admin/page.tsx:24` (redireciona). |
| 12 | `.gitignore` cobre `.env*` e `registro/` | OK | `.gitignore:5-7` e `:12`. `.env.example` e `.env.test` são versionados de propósito; o `.env.test` só tem valores de teste. |
| 13 | Sem senha de bootstrap no histórico | OK | `git log --all -S "ADMIN_BOOTSTRAP_PASSWORD="`: um commit, duas ocorrências, ambas com valor vazio. |
| 14 | `npm audit --omit=dev` sem alta ou crítica | **Pendente** | Ver abaixo. |

### Pendência: `npm audit`

`deepmerge-ts` 7.1.5 (GHSA-ggr8-5vv4-36mx, alta: estouro de pilha ao mesclar objetos recursivos),
trazido por `prisma` 6.19.3 → `@prisma/config` 6.19.3. A correção oferecida pelo npm é
`npm audit fix --force`, que rebaixa o `prisma` para 6.12.0 (mudança incompatível), por isso não foi
aplicada. O pacote é usado pela linha de comando do Prisma para ler a configuração (`migrate`,
`generate`); não processa dado de requisição. Opções: aguardar versão do Prisma com a dependência
corrigida; ou forçar `deepmerge-ts` 8 por `overrides` no `package.json` e validar `prisma migrate` e
`prisma generate`.

## Sorteio

A escolha do ganhador usa só `node:crypto` (`src/server/draw.service.ts:215`, `randomInt`).
O `Math.random` de `src/domain/orders.ts:30` serve apenas para sugerir números livres na tela.

## Como conferir de novo

```
npm test                    # inclui tests/security/headers.test.ts
npm run test:integration    # inclui tests/security/api.int.test.ts
npm audit --omit=dev --audit-level=high
curl -sI https://<domínio>/ | grep -i "content-security-policy\|x-frame-options"
```
