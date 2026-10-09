---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-6, testes, playwright, ci]
---

# T21 — Testes: cobertura mínima, Playwright smoke e CI

- **Modelo:** opus.
- **Depende de:** T08, T16, T20.
- **Arquivos:** (criar) `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `.github/workflows/ci.yml`; (revisar) `tests/**`.

## Passos
1. Verificar que existem e passam os testes listados nas tarefas anteriores. Fazer uma tabela no relatório: arquivo → o que cobre. Se faltar algum caso listado em T05, T06, T07, T08, T14, T16, T18, T20, escrever agora.
2. Playwright: `npm install -D @playwright/test && npx playwright install chromium`. `playwright.config.ts` com `baseURL: 'http://127.0.0.1:3180'`, `webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: true, env: { DEMO_MODE: 'true', PAYMENT_GATEWAY: 'demo' } }`.
3. `tests/e2e/smoke.spec.ts`:
   - landing carrega e mostra a barra de progresso;
   - `/contribuir?valor=5` mostra a grade, selecionar aleatório marca 10 números, preencher dados válidos (CPF gerado válido no teste), enviar → URL `/pagamento/<id>?t=`;
   - clicar "Simular aprovação (demo)" → URL `/obrigado/<id>`;
   - `/admin` sem sessão mostra o formulário de login; login com admin criado pelo script (`ADMIN_BOOTSTRAP_*` do ambiente de teste, senha de teste, não a real) entra, cai em trocar senha, troca e vê métricas;
   - `/regulamento` contém "sorteio".
4. **Regressão visual das páginas protegidas**: no mesmo spec, `expect(page).toHaveScreenshot()` para `/`, `/contribuir?valor=5`, `/pagamento/<id>` e `/obrigado/<id>` em 1280 e 390 px, com `maxDiffPixelRatio: 0.01` e as áreas dinâmicas (valores, cronômetro, QR) mascaradas via `mask`. Gerar a baseline a partir das capturas de `revisao/baseline/` (T00) ou, se o formato não bater, na primeira execução **antes** de qualquer tarefa de front (usar `git stash`/checkout do commit da T00 se necessário) e commitar os snapshots.
5. Scripts: `"test:e2e": "playwright test"`, `"test:all": "npm test && npm run test:integration && npm run test:e2e"`.
6. `.github/workflows/ci.yml`: job em `ubuntu-latest` com serviço `postgres:16` (user/pass/db `test`, porta 5433→5432), passos: checkout, node 22, `npm ci`, `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, `npx prisma migrate deploy` (com `DATABASE_URL` do serviço), `npm run test:integration`, `npm run build`. E2E em job separado com `continue-on-error: true`.

## Critério de aceite
```
npm run test:all
```
Tudo verde localmente. Colar no relatório a contagem de testes por suíte.

## Não fazer
- Não marcar testes como `skip` para passar.
- Não usar credenciais reais em testes ou CI (nem as do `.env`).

## Desvios registrados
- 2026-10-09: portas do host trocadas por conflito com outros containers da máquina. Onde este arquivo diz `5432` (host) use `5442`; onde diz `5433` use `5443`. Ver [[decisoes/008-portas-do-postgres-local]].
- 2026-10-09: snapshots visuais gerados do estado atual, não do commit da T00 ([[decisoes/012-snapshots-visuais-a-partir-do-estado-validado]]). Ficam em `tests/e2e/__snapshots__/` (Windows/Chromium); no CI a comparação de imagens é desligada por `E2E_IGNORE_SNAPSHOTS=1` e o fluxo roda inteiro.
- Passo 2: nada instalado, o Playwright já estava no projeto. O `webServer.env` leva também `SMTP_HOST=127.0.0.1`/`SMTP_PORT=1025`, para um servidor iniciado pelo Playwright nunca usar o SMTP do `.env`.
- Passo 3: o admin do E2E é criado num `globalSetup` com `createAdmin` (senha aleatória só em memória, e-mail `e2e-admin+<aleatório>@exemplo.invalid` por causa do limite de 5 logins por e-mail) e removido no `globalTeardown`; um segundo admin de papel ADMIN cobre essa visão. O spec manda `X-Forwarded-For` fictício por execução para não esbarrar nos limitadores.
- Sem relatório HTML, trace, vídeo nem captura do Playwright: gravariam em disco o que é digitado nos campos.
- Passo 6: no CI o Postgres fica em 5443 (a trava dos testes de integração só aceita `localhost:5443/test`), há `npx prisma generate`, `npx next typegen` e `npm run db:seed` antes do build. O workflow teve só a sintaxe validada; nunca rodou num runner.
- Passo 1: nenhum caso listado nas tarefas faltava. Acrescentados 31 testes unitários (`tests/lib/admin-client.test.ts`, `tests/server/rate-limit.test.ts`, `tests/server/crypto.test.ts`, `tests/proxy.test.ts`).
- Sem teste pela interface: salvar edição de produto, estorno, exportar CSV, configurações e card do sorteio (têm teste de rota/serviço). Cada execução do E2E deixa um pedido aprovado de R$ 5 "Contribuinte E2E" no banco de dev.
