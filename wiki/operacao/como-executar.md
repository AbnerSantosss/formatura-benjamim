---
tipo: operacao
atualizado: 2026-10-09
tags: [dev, setup, comandos]
---

# Como executar

Os comandos abaixo foram conferidos com o `package.json` e com os arquivos citados. Eles **não foram executados** na redação desta página. Se algum falhar, confira a versão do Node (22) e o Docker.

## Primeira vez (desenvolvimento)
```bash
cp .env.example .env                  # no Windows: copy .env.example .env
# editar .env: AUTH_SECRET e CPF_ENCRYPTION_KEY (openssl rand -hex 32), o resto já vem preenchido para dev
docker compose --profile dev up -d db mailpit
npm install                           # roda prisma generate sozinho
npm run db:migrate                    # prisma migrate deploy
npm run db:seed                       # campanha + 2 produtos (idempotente)
npm run admin:create -- --email voce@exemplo.com --name "Seu nome"   # pede a senha no terminal
npm run dev
```

- `npm run db:migrate` aplica as migrações existentes com `prisma migrate deploy`. Não use `npx prisma migrate dev` para isso: ele pode criar migrações novas.
- Se o cliente do Prisma não existir, rode `npx prisma generate`.
- `admin:create` pede a senha sem mostrar o que é digitado. A senha precisa ter pelo menos 10 caracteres, com letras e números. No primeiro acesso, o sistema exige trocar a senha.
- Landing: http://127.0.0.1:3180
- Painel: http://127.0.0.1:3180/admin
- E-mails de dev: http://localhost:8025 (Mailpit). Para usar, `SMTP_HOST=127.0.0.1` e `SMTP_PORT=1025`.
- Pagamento em dev sem gateway real: `PAYMENT_GATEWAY=demo` e `DEMO_MODE=true` (valores do `.env.example`). A tela Pix mostra o botão "Simular aprovação (demo)". Esse modo é recusado com `NODE_ENV=production`.

## Uso do dia a dia
```bash
docker compose --profile dev up -d db mailpit   # se o Docker tiver sido parado
npm run dev
```

## Testes
```bash
npm test                              # unitários (Vitest), não precisa de banco
docker compose -f docker-compose.test.yml up -d   # Postgres de teste em 127.0.0.1:5443
npm run test:integration              # carrega .env.test e recusa banco que não seja o de teste
npm run test:e2e                      # Playwright; usa o banco de DATABASE_URL (o de dev) e cria pedidos fictícios
npm run test:all                      # unitários, integração e E2E, em sequência
```

Snapshots do Playwright valem para Windows e Chromium. No CI, `E2E_IGNORE_SNAPSHOTS=1` desliga a comparação de imagem.

## Qualidade e build
```bash
npm run typecheck                     # tsc --noEmit
npm run lint                          # eslint . (0 erros; 2 avisos conhecidos em src/lib/admin-client.ts)
npm run format:check                  # Prettier, só verifica
npm run format                        # Prettier, escreve
npm run build                         # build de produção
```

## Scripts do `package.json`
| Script | Faz |
|---|---|
| `dev` | Next em 127.0.0.1:3180 |
| `build` | `next build` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |
| `format`, `format:check` | Prettier (escreve / verifica) |
| `test`, `test:watch` | Vitest (unitário, e modo contínuo) |
| `test:integration` | Vitest com o Postgres de teste |
| `test:e2e` | Playwright |
| `test:all` | os três em sequência |
| `db:migrate` | `prisma migrate deploy` |
| `db:seed` | `tsx prisma/seed.ts` |
| `db:studio` | Prisma Studio |
| `admin:create` | `tsx scripts/admin-create.ts` (cria ou atualiza administrador) |
| `email:test` | `tsx --conditions=react-server scripts/email-test.ts`; exemplo: `npm run email:test -- --to voce@exemplo.com` |

Não existem os scripts `start` nem `expire` no `package.json`. A expiração de pedidos roda pela rota `/api/internal/expirar` (para cron) ou pelo botão "Rodar expiração agora" em Configurações.

## Pagamento com Mercado Pago sandbox
Credenciais de teste no `.env` (`PAYMENT_GATEWAY=mercadopago`). Para o webhook alcançar o computador, é preciso um túnel HTTPS, por exemplo `npx cloudflared tunnel --url http://127.0.0.1:3180`, e cadastrar essa URL no painel do Mercado Pago. Isso ainda não foi testado com credenciais reais.

Ver [[operacao/variaveis-de-ambiente]], [[operacao/deploy]] e [[operacao/checklist-producao]].
