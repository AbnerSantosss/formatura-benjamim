---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-0, docker]
---

# T02 — Docker, Compose e Caddy

- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** T00.
- **Arquivos (criar):** `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.test.yml`, `Caddyfile`.

## Passos
1. Criar `.dockerignore`:
   ```
   node_modules
   .next
   out
   .git
   .env*
   !.env.example
   revisao
   referencias
   registro
   wiki
   ```
2. Criar `Dockerfile`:
   ```dockerfile
   FROM node:22-alpine AS deps
   WORKDIR /app
   COPY package.json package-lock.json ./
   RUN npm ci

   FROM node:22-alpine AS build
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .
   ENV NEXT_TELEMETRY_DISABLED=1
   RUN npx prisma generate && npm run build

   FROM node:22-alpine AS runner
   WORKDIR /app
   ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
   RUN addgroup -S app && adduser -S app -G app
   COPY --from=build /app/.next/standalone ./
   COPY --from=build /app/.next/static ./.next/static
   COPY --from=build /app/public ./public
   COPY --from=build /app/prisma ./prisma
   COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
   COPY --from=build /app/node_modules/prisma ./node_modules/prisma
   COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
   USER app
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```
   Observação: `npx prisma generate` só funciona depois da T03. Até lá o build da imagem falha; isso é esperado e o critério de aceite desta tarefa não exige a imagem.
3. Criar `docker-compose.yml`:
   ```yaml
   services:
     db:
       image: postgres:16-alpine
       restart: unless-stopped
       environment:
         POSTGRES_USER: benjamim
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-benjamim}
         POSTGRES_DB: benjamim
       volumes: [ "pgdata:/var/lib/postgresql/data" ]
       ports: [ "127.0.0.1:5432:5432" ]
       healthcheck:
         test: [ "CMD-SHELL", "pg_isready -U benjamim" ]
         interval: 5s
         timeout: 3s
         retries: 20
     app:
       build: .
       restart: unless-stopped
       env_file: .env
       environment:
         DATABASE_URL: postgresql://benjamim:${POSTGRES_PASSWORD:-benjamim}@db:5432/benjamim
       depends_on:
         db: { condition: service_healthy }
       expose: [ "3000" ]
     caddy:
       image: caddy:2-alpine
       restart: unless-stopped
       ports: [ "80:80", "443:443" ]
       environment:
         SITE_DOMAIN: ${SITE_DOMAIN:-localhost}
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy_data:/data
         - caddy_config:/config
       depends_on: [ app ]
     mailpit:
       image: axllent/mailpit
       profiles: [ "dev" ]
       ports: [ "127.0.0.1:8025:8025", "127.0.0.1:1025:1025" ]
   volumes:
     pgdata: {}
     caddy_data: {}
     caddy_config: {}
   ```
4. Criar `docker-compose.test.yml`:
   ```yaml
   services:
     dbtest:
       image: postgres:16-alpine
       environment: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
       ports: [ "127.0.0.1:5433:5432" ]
       tmpfs: [ "/var/lib/postgresql/data" ]
   ```
5. Criar `Caddyfile`:
   ```
   {$SITE_DOMAIN:localhost} {
     encode gzip
     reverse_proxy app:3000
   }
   ```
6. Rodar `docker compose config` (valida o YAML) e `docker compose -f docker-compose.test.yml config`.
7. Rodar `docker compose up -d db` e `docker compose exec db pg_isready -U benjamim`; depois `docker compose down`. Se Docker não estiver instalado na máquina, registrar isso no relatório e seguir (o orquestrador decide).

## Critério de aceite
```
docker compose config > /dev/null && echo compose-ok
docker compose -f docker-compose.test.yml config > /dev/null && echo compose-test-ok
test -f Dockerfile && test -f Caddyfile && test -f .dockerignore && echo arquivos-ok
```

## Não fazer
- Não colocar senhas reais no compose; usar `${POSTGRES_PASSWORD:-benjamim}` e o `.env`.
- Não expor o Postgres em `0.0.0.0`.

## Desvios registrados
- 2026-10-09: portas do host trocadas por conflito com outros containers da máquina. Onde este arquivo diz `5432` (host) use `5442`; onde diz `5433` use `5443`. Ver [[decisoes/008-portas-do-postgres-local]].
