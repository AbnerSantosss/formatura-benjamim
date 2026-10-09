---
tipo: operacao
atualizado: 2026-10-09
tags: [dev, setup, comandos]
---

# Como executar

## Hoje (protótipo, antes do plano)
```bash
npm install
npm run dev        # http://127.0.0.1:3180 (tudo em localStorage; porta definida no package.json)
npm test           # 12 testes de domínio
npm run typecheck && npm run lint && npm run build
```

## Depois do plano (alvo)
```bash
cp .env.example .env            # preencher pelo menos DATABASE_URL, AUTH_SECRET, CPF_ENCRYPTION_KEY
docker compose --profile dev up -d db mailpit
npm install
npx prisma migrate dev          # cria tabelas + índice parcial
npm run db:seed                 # campanha + 2 produtos
npm run admin:create -- --email voce@exemplo.com --name "Abner"   # pede senha
npm run dev
```
- Landing: http://127.0.0.1:3180 (o script `dev` usa a porta 3180)
- Painel: http://127.0.0.1:3180/admin
- E-mails de dev: http://localhost:8025 (Mailpit)
- Pagamento em dev sem chaves: `DEMO_MODE=true` + `PAYMENT_GATEWAY=demo` (botão "Simular aprovação").
- Pagamento em dev com Mercado Pago sandbox: credenciais de teste no `.env`, `PAYMENT_GATEWAY=mercadopago`, expor com `npx cloudflared tunnel --url http://127.0.0.1:3180` e cadastrar a URL do webhook.

## Scripts previstos no `package.json`
| Script | Faz |
|---|---|
| `dev`, `build`, `start` | Next |
| `typecheck`, `lint`, `format` | `tsc --noEmit`, `eslint .`, `prettier --write .` |
| `test` | Vitest unitário (domínio) |
| `test:integration` | Vitest com Postgres de teste (`docker-compose.test.yml`) |
| `test:e2e` | Playwright smoke |
| `db:migrate`, `db:seed`, `db:studio` | Prisma |
| `admin:create` | cria OWNER |
| `expire` | roda `expireStaleOrders()` uma vez (para cron) |

Ver [[operacao/variaveis-de-ambiente]] e [[operacao/deploy]].
