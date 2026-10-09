# Formatura do Benjamim — campanha de arrecadação

Site da campanha para a formatura do ABC do Benjamim. A campanha opera com **números e sorteio** (decisão em [wiki/decisoes/001-rifa-com-numeros-e-sorteio.md](wiki/decisoes/001-rifa-com-numeros-e-sorteio.md)). O pagamento é por Pix; o painel administrativo fica em `/admin`.

**Estado (2026-10-09):** tarefas T00 a T23 concluídas. A T24 (deploy em VPS) depende do dono e ainda não foi feita. O Mercado Pago tem adapter escrito pela documentação oficial, mas **não foi testado com credenciais reais**. FastPay e IronPay são esqueletos, sem implementação.

A documentação completa está em [wiki/index.md](wiki/index.md). Para o público não técnico, veja [README_PARA_ABNER.md](README_PARA_ABNER.md).

## Stack

- Next.js 16.4 (App Router, servidor Node com `output: 'standalone'`), React 19.3, TypeScript 6 em modo estrito.
- CSS puro (sem Tailwind), Lucide para ícones.
- PostgreSQL 16 com Prisma 6. Validação com Zod 4.
- Senhas com bcrypt; sessão em banco com cookie HttpOnly.
- E-mail por SMTP com Nodemailer.
- Testes: Vitest (unitários e integração) e Playwright (E2E).
- Produção: Docker Compose com Caddy para HTTPS.

Detalhes em [wiki/arquitetura/stack.md](wiki/arquitetura/stack.md).

## Pré-requisitos

- Node.js 22 (a mesma versão do `Dockerfile` e do CI).
- Docker, para o Postgres e o Mailpit de desenvolvimento.
- Git.

## Rodar em desenvolvimento

```sh
cp .env.example .env
```

No Windows, use `copy .env.example .env`. Depois abra o `.env` e preencha `AUTH_SECRET` e `CPF_ENCRYPTION_KEY` (gere cada um com `openssl rand -hex 32`). O `DATABASE_URL` já aponta para o Postgres local da porta 5442. Não versione o `.env`.

```sh
docker compose --profile dev up -d db mailpit
npm install
npm run db:migrate
npm run db:seed
npm run admin:create -- --email voce@exemplo.com --name "Seu nome"
npm run dev
```

- `npm install` roda `prisma generate` sozinho. Se o cliente do Prisma não for gerado, rode `npx prisma generate`.
- `admin:create` pede a senha no terminal, sem mostrar o que é digitado. A senha precisa ter 10 caracteres ou mais, com letras e números. O primeiro acesso exige trocar a senha.
- Endereços: site em http://127.0.0.1:3180, painel em http://127.0.0.1:3180/admin, e-mails de desenvolvimento em http://localhost:8025 (Mailpit, se `SMTP_HOST=127.0.0.1` e `SMTP_PORT=1025`).
- Sem gateway real, use `PAYMENT_GATEWAY=demo` e `DEMO_MODE=true` (já são os valores do `.env.example`). A tela de Pix mostra o botão "Simular aprovação (demo)". Esse modo é recusado quando `NODE_ENV=production`.

Passo a passo completo, com o que é esperado em cada etapa: [wiki/operacao/como-executar.md](wiki/operacao/como-executar.md).

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento em 127.0.0.1:3180 |
| `npm run build` | build de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (0 erros; 2 avisos conhecidos em `src/lib/admin-client.ts`) |
| `npm run format` / `npm run format:check` | Prettier (escrever / só verificar) |
| `npm test` | testes unitários (Vitest, sem banco) |
| `npm run test:watch` | Vitest em modo contínuo |
| `npm run test:integration` | testes com o Postgres de teste (porta 5443) |
| `npm run test:e2e` | Playwright, Chromium, um fluxo completo |
| `npm run test:all` | unitários, integração e E2E, em sequência |
| `npm run db:migrate` | aplica as migrações (`prisma migrate deploy`) |
| `npm run db:seed` | cria a campanha e os dois produtos (idempotente) |
| `npm run db:studio` | interface visual do banco (Prisma Studio) |
| `npm run admin:create` | cria ou atualiza um administrador |
| `npm run email:test -- --to voce@exemplo.com` | envia um e-mail de teste |

## Testes

- `npm test` não precisa de banco.
- `npm run test:integration` precisa do banco de teste: `docker compose -f docker-compose.test.yml up -d`. O teste carrega `.env.test` e recusa qualquer banco que não seja o de teste.
- `npm run test:e2e` usa o banco definido em `DATABASE_URL` (o de desenvolvimento) e cria pedidos fictícios nele. As comparações de imagem são da plataforma Windows; no CI elas ficam desligadas por `E2E_IGNORE_SNAPSHOTS=1`.

Contagens na última rodada (T22): 137 unitários, 129 de integração, 11 E2E.

## Variáveis de ambiente

A lista completa, com obrigatoriedade por ambiente, está em [wiki/operacao/variaveis-de-ambiente.md](wiki/operacao/variaveis-de-ambiente.md). O `.env.example` traz os valores de desenvolvimento e deixa os segredos vazios. Segredos ficam apenas no `.env` local ou no servidor; nunca no código, na wiki ou nos commits.

## Produção (resumo)

Caminho recomendado: VPS com Docker Compose (`Dockerfile`, `docker-compose.yml`, `Caddyfile`). O Caddy obtém o HTTPS para o domínio em `SITE_DOMAIN`. O procedimento completo está em [wiki/operacao/deploy.md](wiki/operacao/deploy.md), e a lista de conferência antes de cobrar de verdade está em [wiki/operacao/checklist-producao.md](wiki/operacao/checklist-producao.md).

**Estado do deploy (T24, 2026-10-09):** a preparação está feita e foi ensaiada em Docker local: a imagem é construída do zero sem banco e sem segredos, e a migração, o seed e o `admin:create` rodam por uma imagem de ferramentas (`docker compose run --rm tools ...`), porque a imagem do app não tem `tsx` nem a CLI do Prisma. O app roda como usuário sem privilégios. **O deploy na VPS ainda não foi feito**: HTTPS com o domínio real, Mercado Pago e SMTP de verdade continuam sem verificação.

Segurança (cabeçalhos, CSP, IP do cliente, limites de tentativas e resultado da revisão): [wiki/operacao/seguranca.md](wiki/operacao/seguranca.md).

## Estrutura de pastas

- `src/app/`: rotas (landing, `/contribuir`, `/pagamento/[id]`, `/obrigado/[id]`, `/admin/**`, `/api/**`, `/privacidade`, `/termos`, `/regulamento`).
- `src/components/`: telas públicas e painel administrativo (`admin/`).
- `src/domain/`: regras puras (valores em centavos, pedidos, sorteio, validação).
- `src/server/`: serviços, gateways de pagamento, autenticação, e-mail, banco e ambiente.
- `prisma/`: schema, migrações e seed.
- `scripts/`: `admin-create.ts` e `email-test.ts`.
- `tests/`: unitários, integração, segurança e E2E.
- `wiki/`: documentação, decisões e plano de execução.

Mapa arquivo por arquivo: [wiki/arquitetura/estrutura-de-pastas.md](wiki/arquitetura/estrutura-de-pastas.md).

## Pendências para produção com Mercado Pago

1. Confirmar com o dono a regulamentação da operação de números e sorteio. O tema está registrado na decisão 001 e não é resolvido pelo código.
2. Criar a aplicação no painel de desenvolvedor do Mercado Pago e obter as credenciais de produção; configurar o webhook HTTPS e a assinatura secreta. Detalhes em [wiki/integracoes/mercado-pago.md](wiki/integracoes/mercado-pago.md), seção "Pendências para produção".
3. Testar um pagamento real de R$ 5 e conferir aprovação, e-mail e número confirmado.
4. Decidir o tratamento de Pix pago depois do prazo de expiração (decisão do dono em [wiki/decisoes/010-contratos-reais-da-janela-b.md](wiki/decisoes/010-contratos-reais-da-janela-b.md)).
5. Trocar os textos de demonstração que ainda aparecem nas telas públicas (lista na entrada "Fase 3 concluída (T09–T13)" de [wiki/log.md](wiki/log.md)).

## Privacidade

O CPF é cifrado em repouso (AES-256-GCM) e não aparece nas páginas públicas nem nos logs. Os textos de privacidade e termos ainda precisam de revisão antes da cobrança real.
