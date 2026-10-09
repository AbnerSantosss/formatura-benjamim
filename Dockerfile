# Três imagens saem deste arquivo:
#   runner (padrão) — o app em produção: só o `standalone` do Next, usuário sem privilégios.
#   tools           — `node_modules` completo + prisma/ + scripts/ + src/, para migração, seed e
#                     admin:create. Usada por `docker compose run --rm tools ...`; não fica no ar.
# Procedimento: wiki/operacao/deploy.md.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# O `postinstall` roda `prisma generate`, que precisa do schema.
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# `NEXT_PUBLIC_*` é embutido no bundle durante o build: o domínio chega como build arg
# (o docker-compose.yml repassa o valor do .env). Não é segredo.
ARG NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_SITE_URL" \
  || { echo "Falta o build arg NEXT_PUBLIC_SITE_URL (defina NEXT_PUBLIC_SITE_URL=https://<dominio> no .env)." >&2; exit 1; }
# O build não fala com o banco nem usa segredos. `DATABASE_URL` e `PAYMENT_GATEWAY` abaixo são
# marcadores só para a validação de `src/server/env.ts` passar; valem apenas nesta linha e não vão
# para a imagem final. Os valores reais entram quando o contêiner sobe (env_file do compose).
RUN npx prisma generate \
  && NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" \
     DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
     PAYMENT_GATEWAY="mercadopago" \
     npm run build

FROM node:22-alpine AS tools
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
USER app
CMD ["npx", "prisma", "migrate", "status"]

# Último estágio = alvo padrão de `docker build .`
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
USER app
EXPOSE 3000
CMD ["node", "server.js"]
