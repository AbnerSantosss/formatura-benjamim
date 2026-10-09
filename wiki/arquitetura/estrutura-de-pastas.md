---
tipo: arquitetura
atualizado: 2026-10-09
tags: [estrutura, arquivos]
---

# Estrutura de pastas (estado em 2026-10-09, após T23)

Lista de pastas e arquivos principais, conferida com `git ls-files` e `find src prisma scripts tests -type f`. A lista completa de arquivos rastreados é a saída de `git ls-files`. Os PNG de `tests/e2e/__snapshots__/` e as imagens de `revisao/` não estão detalhados.

```
.
├── .github/workflows/ci.yml      # CI (nunca rodou num runner ainda)
├── AGENTS.md                     # instruções para agentes (aponta a wiki e a decisão 001)
├── CLAUDE.md                     # regra: ler a wiki antes de trabalhar
├── CODEX_INSTRUCTIONS.md         # briefing original (vaquinha sem sorteio); superado, ver ADR 001
├── Caddyfile                     # HTTPS e proxy reverso para o app (usa SITE_DOMAIN)
├── Dockerfile                    # build multi-stage, Node 22 alpine
├── GEMINI.md                     # instruções para outro agente de IA (não conferido nesta revisão)
├── README.md                     # guia do projeto para desenvolvedor
├── README_PARA_ABNER.md          # guia em linguagem simples para o dono
├── docker-compose.yml            # db, app, caddy (mailpit no perfil dev)
├── docker-compose.test.yml       # Postgres de teste (porta 5443)
├── .env.example                  # nomes das variáveis, sem valores
├── .env.test                     # variáveis do teste de integração, sem segredos de produção
├── next.config.ts                # cabeçalhos de segurança e CSP
├── package.json                  # scripts (ver wiki/operacao/como-executar.md)
├── playwright.config.ts          # E2E
├── vitest.config.ts              # testes unitários
├── vitest.integration.config.ts  # testes de integração
├── eslint.config.mjs             # ESLint 9 flat config
├── prisma/
│   ├── schema.prisma             # modelo de dados
│   ├── migrations/               # 2 migrações (init e admin_must_change_password)
│   └── seed.ts                   # campanha e os dois produtos (idempotente)
├── scripts/
│   ├── admin-create.ts           # cria ou atualiza administrador
│   ├── email-test.ts             # envia e-mail de teste
│   └── baseline-demo.mjs         # script que sobrou do protótipo (ver observações)
├── public/images/                # fotos e artes usadas nas telas
├── referencias/                  # mockups aprovados (desktop, mobile, checkout)
├── revisao/                      # capturas de tela, baseline e prompts de imagem
│   └── baseline/                 # referência humana das telas públicas
├── tests/
│   ├── domain/                   # regras puras: pedidos, sorteio, validação
│   ├── auth/, server/, gateways/, email/, lib/
│   ├── integration/              # API, auth, sorteio e serviço de pedidos com Postgres
│   ├── security/                 # cabeçalhos e API (T22)
│   └── e2e/                      # Playwright: smoke e snapshots
├── wiki/                         # documentação, decisões e plano de execução
├── registro/sessoes/             # registro automático de sessões (fora da wiki, no .gitignore)
└── src/
    ├── proxy.ts                  # protege /admin e rotas de API restritas
    ├── app/
    │   ├── layout.tsx            # layout raiz
    │   ├── page.tsx              # landing
    │   ├── contribuir/page.tsx   # checkout
    │   ├── pagamento/[id]/page.tsx   # tela Pix
    │   ├── obrigado/[id]/page.tsx    # agradecimento, validado no servidor
    │   ├── [legal]/page.tsx      # /privacidade, /termos, /regulamento
    │   ├── admin/                # painel: login, trocar senha, convite, redefinir senha
    │   ├── api/
    │   │   ├── admin/            # auth, pedidos, produtos, usuários, configurações, sorteio, expirar, exportar.csv, métricas
    │   │   ├── campanha/         # dados públicos da campanha
    │   │   ├── pedidos/          # criar pedido e consultar status
    │   │   ├── numeros/ocupados/ # números já vendidos
    │   │   ├── webhooks/         # mercadopago, fastpay, ironpay
    │   │   ├── internal/expirar/ # expiração de pedidos (para cron)
    │   │   └── demo/aprovar/     # aprovação simulada (só gateway demo)
    │   └── *.css                 # estilos aprovados (reference.css, order-flow.css, etc.)
    ├── components/
    │   ├── reference-landing.tsx # landing completa
    │   ├── checkout.tsx          # formulário do pedido
    │   ├── number-picker.tsx     # grade de números
    │   ├── payment-frame.tsx     # moldura da tela Pix
    │   ├── payment-status-poller.tsx  # consulta o status do pedido a cada 5 s
    │   ├── thanks-view.tsx       # agradecimento
    │   ├── backoffice.tsx        # painel
    │   └── admin/                # telas do painel: pedidos, produtos, usuários, configurações, sorteio, login
    ├── domain/                   # regras puras: money, orders, draw, validation, types
    ├── lib/                      # campaign.ts, admin-client.ts, api-client.ts, demo-model.ts
    └── server/
        ├── orders.service.ts     # pedidos, estorno, expiração
        ├── payment-sync.ts       # sincronização com o gateway
        ├── draw.service.ts       # sorteio (trava na campanha)
        ├── admin.service.ts      # painel, CSV, máscara de CPF
        ├── gateways/             # mercadopago (Pix), demo, fastpay e ironpay (stubs), registry
        ├── auth/                 # sessão, senha, convites, tokens, CSRF, require-admin
        ├── email/                # transporte SMTP e templates
        ├── client-ip.ts          # IP do cliente (último valor do X-Forwarded-For)
        ├── rate-limit.ts         # limites de tentativas (em memória)
        ├── crypto.ts             # cifragem do CPF (AES-256-GCM)
        ├── env.ts                # leitura e validação das variáveis
        ├── db.ts                 # cliente do Prisma
        └── audit.ts              # registro de auditoria
```

## Observações
- Os arquivos `.tsx` de componentes seguem a formatação do Prettier. Rode `npm run format` antes de comparar diffs.
- `reference.css` e `order-flow.css` concentram o visual aprovado. Não reescrever, só estender.
- `scripts/baseline-demo.mjs` ainda está no repositório e não foi conferido nesta revisão. Confirmar antes de remover.
- `demo-store.ts` e `product-catalog.tsx` foram removidos na T19 (ver `wiki/log.md`). `contribution.tsx` não aparece mais na lista de arquivos rastreados.

Ver [[arquitetura/arquitetura-alvo]] para o desenho da arquitetura.
