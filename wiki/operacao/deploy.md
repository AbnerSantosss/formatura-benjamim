---
tipo: operacao
atualizado: 2026-10-09
tags: [deploy, docker, vps, caddy, vercel]
---

# Deploy

## Caminho A (recomendado): VPS com Docker Compose
Requisitos: VPS Ubuntu 22.04+ com 2 GB RAM, domínio apontando para o IP (A/AAAA), Docker + Compose instalados.

Arquivos: `Dockerfile` (multi-stage, `output: 'standalone'`), `docker-compose.yml` (serviços `app`, `db`, `caddy`; perfil `dev` adiciona `mailpit`), `Caddyfile`.

```bash
# no servidor
git clone <repo> benjamim && cd benjamim
cp .env.example .env && nano .env         # preencher
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
docker compose exec app npm run admin:create -- --email voce@exemplo.com --name "Abner"
```
- Caddy obtém HTTPS automaticamente para o domínio do `Caddyfile`.
- Atualizar: `git pull && docker compose up -d --build && docker compose exec app npx prisma migrate deploy`.
- Backup: cron diário `docker compose exec -T db pg_dump -U benjamim benjamim | gzip > /backups/$(date +%F).sql.gz`; manter 30 dias; copiar para fora do servidor (rclone para Google Drive/B2).
- Expiração: cron a cada 5 min `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/internal/expirar` (opcional; a expiração preguiçosa já cobre).
- Logs: `docker compose logs -f app`. Sem PII nos logs.

## Caminho B: Vercel + Neon
- Projeto Vercel apontando para o repo; `DATABASE_URL` do Neon (pooled) + `DIRECT_URL` para migrações.
- `npx prisma migrate deploy` roda no build (`vercel-build`) ou localmente apontando para o Neon.
- Webhook do Mercado Pago aponta para `https://<app>.vercel.app/api/webhooks/mercadopago`.
- Limitação: rate limit em memória não funciona entre instâncias; trocar por tabela `RateLimit` (tarefa curta).

## Checklist de ida ao ar
Ver [[operacao/checklist-producao]].
