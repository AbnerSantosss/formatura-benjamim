---
tipo: operacao
atualizado: 2026-10-09
tags: [env, configuracao, segredos]
---

# Variáveis de ambiente

Validadas em `src/server/env.ts` (Zod). Obrigatórias faltando em produção → processo não sobe. Nunca commitar `.env`; `.env.example` sem valores reais.

| Variável | Obrig. | Exemplo | Observação |
|---|---|---|---|
| `NODE_ENV` | sim | `production` | |
| `NEXT_PUBLIC_SITE_URL` | sim | `https://benjamim.exemplo.com.br` | links de e-mail, CSRF, webhook |
| `DATABASE_URL` | sim | `postgresql://user:pass@db:5432/benjamim` | |
| `AUTH_SECRET` | sim | 32+ bytes hex | assinatura de cookies auxiliares; `openssl rand -hex 32` |
| `CPF_ENCRYPTION_KEY` | sim | 32 bytes hex | AES-256-GCM do CPF e das credenciais de gateway salvas no painel; **perder = perder os CPFs e ter de salvar as chaves de novo** |
| `PAYMENT_GATEWAY` | sim | `mercadopago` | `mercadopago` / `fastpay` / `ironpay` / `demo` (dev). Vale enquanto o painel não escolher outro ([[decisoes/015-credenciais-de-gateway-no-painel]]) |
| `DEMO_MODE` | não | `false` | `true` só em dev; em produção é ignorado e vira erro de boot |
| `MP_ACCESS_TOKEN` | não | `APP_USR-...` | pode ser salva no painel; o painel vale no lugar desta |
| `MP_PUBLIC_KEY` | não | | |
| `MP_WEBHOOK_SECRET` | não | | idem |
| `MP_ENVIRONMENT` | não | `sandbox` | |
| `MP_API_FLAVOR` | não | `orders` | `orders` ou `payments` |
| `FASTPAY_API_URL`, `FASTPAY_API_KEY`, `FASTPAY_WEBHOOK_SECRET` | não | | idem |
| `IRONPAY_API_URL`, `IRONPAY_API_KEY`, `IRONPAY_WEBHOOK_SECRET` | não | | idem |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | prod | | dev sem SMTP usa console |
| `MAIL_FROM` | prod | `"BENJAMIM ABC <conta@gmail.com>"` | nome exibido: BENJAMIM ABC |
| `MAIL_REPLY_TO` | não | | |
| `CRON_SECRET` | não | | protege `POST /api/internal/expirar` |
| `CAMPAIGN_GOAL_CENTS`, `CAMPAIGN_COSTS_CENTS` | não | `250000` | só para o seed inicial; depois vive no banco |
| `INSTAGRAM_FATHER_URL`, `INSTAGRAM_MOTHER_URL` | não | | só para o seed inicial |
| `LOG_LEVEL` | não | `info` | |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_NAME` | só p/ `admin:create` | | primeiro admin (papel OWNER); lidas pelo script `scripts/admin-create.ts` |
| `ADMIN_BOOTSTRAP_PASSWORD` | só p/ `admin:create` | | senha **temporária**; o usuário é criado com `mustChangePassword = true` e o painel obriga a troca no primeiro login. Apagar do `.env` depois de rodar o script |

## Geração de segredos
```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # CPF_ENCRYPTION_KEY
```
Guardar `CPF_ENCRYPTION_KEY` em cofre (gerenciador de senhas). Rotacionar exige recifrar a tabela `Contributor`.
