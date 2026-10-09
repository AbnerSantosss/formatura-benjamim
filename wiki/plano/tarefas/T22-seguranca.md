---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-6, seguranca, opus]
---

# T22 — Revisão de segurança, limpeza de código de demonstração e conferência visual

- **Modelo:** opus.
- **Depende de:** T08, T16, T18, T21.
- **Arquivos:** `next.config.ts` (headers), `src/server/**` (revisão), `src/app/api/**` (revisão), remoções: `src/lib/demo-store.ts`, `src/components/contribution.tsx`, `src/components/demo-*.tsx` (se ainda existirem), `.openai/hosting.static.json.bak`; (criar) `tests/security/*.test.ts`, `wiki/operacao/seguranca.md`.
- **Ler antes:** [[operacao/checklist-producao]] seção Segurança, [[decisoes/005-autenticacao-propria]].

## Passos
1. Headers em `next.config.ts` via `async headers()` para `/(.*)`: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, e `Content-Security-Policy` compatível com Next (`default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'` em dev e sem `unsafe-eval` em produção; `connect-src 'self'`; `frame-ancestors 'none'`). Testar que a landing e o painel continuam funcionando.
2. Checklist de revisão (responder item a item no relatório, com `grep`/arquivo:linha como evidência):
   - toda rota `/api/admin/**` chama `requireAdmin` e as mutáveis `assertSameOrigin`;
   - nenhuma rota pública aceita status/valor de confirmação;
   - webhooks validam assinatura antes de qualquer `JSON.parse`;
   - `DEMO_MODE`/`demo` gateway impossíveis em produção (`env.ts`), e `/api/demo/*` responde 404 fora de `isDemo`;
   - CPF só existe cifrado; `decryptCpf` não é chamado em nenhuma rota;
   - nenhum `console.log` com e-mail, telefone, CPF, token, senha ou corpo de requisição em `src/server` e `scripts/`;
   - `publicToken` comparado em tempo constante;
   - rate limit em login, esqueci-senha, criação de pedido;
   - cookies `HttpOnly`, `Secure` em produção, `SameSite=Lax`;
   - `Session`/`AuthToken` guardam só hash;
   - `mustChangePassword` bloqueia o painel até a troca;
   - `.gitignore` cobre `.env*` (exceto `.env.example`) e `registro/`; `git log -p --all -S "ADMIN_BOOTSTRAP_PASSWORD="` não encontra valor real;
   - `npm audit --omit=dev` sem vulnerabilidade alta/crítica (ou justificar).
3. Remover arquivos de demonstração listados em "Arquivos" e qualquer import deles. `grep -rn "demo-store\|demoStore\|contribution.tsx" src/` deve ficar vazio.
4. Testes em `tests/security/`: headers presentes em `/` (testar a função `headers()` do config), `GET /api/admin/metricas` sem cookie → 401, `POST /api/admin/configuracoes` com `Origin` estranho → 403, webhook MP com assinatura errada → 401 e nenhuma linha em `WebhookEvent`, replay de webhook não duplica.
5. **Conferência visual final das páginas protegidas**: rodar `npm run test:e2e` (snapshots da T21) e, além disso, comparar manualmente `revisao/baseline/*.png` com capturas novas de `/`, `/contribuir?valor=5`, `/pagamento/<id>`, `/obrigado/<id>`. Qualquer diferença que não seja dado dinâmico é **defeito**: corrigir na origem (voltar o JSX/CSS ao original) e anotar no relatório qual tarefa causou.
6. Escrever `wiki/operacao/seguranca.md` com o resultado do checklist (sem segredos) e adicionar ao `wiki/index.md` na seção Operação.

## Critério de aceite
```
grep -rn "demo-store\|contribution.tsx\|demo-payment\|demo-thanks" src/ ; echo "(esperado: nada)"
npm audit --omit=dev --audit-level=high
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:e2e && npm run build
curl -sI http://127.0.0.1:3180/ | grep -i "x-frame-options\|content-security-policy"
```

## Não fazer
- Não "resolver" um item do checklist removendo a proteção.
- Não desligar a CSP por conveniência; ajustar as fontes permitidas.
- Não alterar o design das páginas públicas para "passar" na comparação; o original é a referência.

## Desvios registrados
- 2026-10-09: o grep do critério (`demo-store|contribution.tsx|demo-payment|demo-thanks`) não zera: sobram 39 ocorrências das classes CSS `demo-payment-card`/`demo-payment-main`, em uso em `payment-frame.tsx`, `thanks-view.tsx` e nos estilos das páginas protegidas. Renomear mexeria no JSX/CSS intocável; ficou como está. Zero ocorrências de `demo-store`, `contribution.tsx` e `demo-thanks`.
- `npm audit --omit=dev --audit-level=high` só passou com `overrides` de `deepmerge-ts` → [[decisoes/013-override-do-deepmerge-ts]].
- Além dos cabeçalhos pedidos: `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `poweredByHeader: false`, e `X-Robots-Tag: noindex, nofollow` + `Cache-Control: no-store` em `/admin/**`, `/pagamento/**`, `/obrigado/**` e `/api/**`.
- A CSP de produção (sem `unsafe-eval`) bloqueava o teste de `new Function` do Zod 4 no checkout; `src/domain/validation.ts` liga `jitless` só no navegador.
- IP do cliente: função única em `src/server/client-ip.ts`, que usa o último valor de `X-Forwarded-For` (o que o proxy grava). O comportamento do Caddy não foi testado na prática, só pela documentação. Os cinco limitadores copiados nas rotas de auth viraram `RATE_LIMITS.auth` em `src/server/rate-limit.ts`.
- A especificação cita `POST /api/admin/configuracoes`; a rota real é `PATCH`, e foi a testada.
- O erro 500 das rotas de auth passou do código `INTERNAL_ERROR` para `INTERNAL`.
- Aviso de hidratação no login: não reproduzido em Chromium limpo; nenhuma mudança.
- Removidos `src/components/contribution.tsx` (sem importador), `.openai/hosting.static.json.bak` e 29 linhas de CSS órfão do painel (`.admin-demo-notice`, `.reset-confirm > button`). Ficaram, só listados: cerca de 30 regras `.contribution*` órfãs, `scripts/baseline-demo.mjs`, `src/lib/demo-model.ts` (em uso pelo checkout).
- Comparação visual feita pelo orquestrador: capturas novas das quatro páginas (1280 e 390 px) contra `revisao/baseline/` e contra as capturas aceitas na T13; mudam só os dados e o banner removido na T13.
