---
tipo: arquitetura
atualizado: 2026-10-09
tags: [producao, backend, api, prisma]
---

# Arquitetura alvo (produção)

```
Navegador --HTTP--> Next.js 16 (Node) --Prisma--> PostgreSQL 16
                        |
                        +--> Gateway (Mercado Pago | FastPay | IronPay) via adapter
                        +--> SMTP (Nodemailer) para e-mails
                        <-- Webhooks dos gateways (POST /api/webhooks/<gateway>)
```

## Camadas (pastas novas em `src/`)
- `src/domain/` — regras puras, sem I/O: `orders.ts` (hoje `demo-model.ts`), `draw.ts` (sorteio), `validation.ts` (Zod: CPF, celular, e-mail, valores).
- `src/server/` — código só de servidor:
  - `db.ts` (PrismaClient singleton)
  - `env.ts` (Zod sobre `process.env`; falha fechado em produção)
  - `orders.service.ts` (criar pedido com reserva transacional, expirar, confirmar, estornar)
  - `gateways/` — `types.ts` (interface), `registry.ts` (escolhe pelo `PAYMENT_GATEWAY`), `mercadopago.ts`, `fastpay.ts`, `ironpay.ts`, `demo.ts`
  - `auth/` — `password.ts` (bcrypt), `session.ts` (cookie + tabela Session), `tokens.ts` (convite/reset), `rate-limit.ts`
  - `email/` — `transport.ts` (Nodemailer), `templates/` (HTML profissionais)
  - `draw.service.ts` — executa o sorteio e grava auditoria
  - `audit.ts` — grava `AuditLog`
- `src/app/api/` — Route Handlers:
  - `POST /api/pedidos` — cria pedido + cobrança
  - `GET  /api/pedidos/[id]/status?t=<token>` — status público mínimo
  - `GET  /api/numeros/ocupados` — lista de números ocupados (para a grade)
  - `GET  /api/campanha` — meta, arrecadado, data do sorteio
  - `POST /api/webhooks/mercadopago`, `/fastpay`, `/ironpay`
  - `POST /api/admin/auth/login|logout|esqueci|redefinir|aceitar-convite`
  - `GET/POST /api/admin/pedidos`, `/api/admin/pedidos/[id]/estornar`, `/api/admin/usuarios`, `/api/admin/configuracoes`, `/api/admin/sorteio`, `/api/admin/exportar.csv`
- `src/proxy.ts` — bloqueia `/admin/**` (exceto login/esqueci/redefinir/convite) sem cookie de sessão válido.
- Páginas: `/`, `/contribuir`, `/pagamento/[id]`, `/obrigado/[id]`, `/privacidade`, `/termos`, `/admin`, `/admin/esqueci-senha`, `/admin/redefinir/[token]`, `/admin/convite/[token]`.

## Regras transversais
- Dinheiro sempre em centavos inteiros.
- IDs públicos opacos (`cuid`). Status monotônico: `PENDING -> APPROVED -> REFUNDED`; `PENDING -> EXPIRED`.
- Pedido nasce **sempre** vinculado a `Product` ([[decisoes/002-produto-antes-do-gateway]]).
- Nada de PII em logs e URLs. CPF cifrado em repouso (AES-256-GCM, chave `CPF_ENCRYPTION_KEY`).
- `DEMO_MODE=true` só funciona com `NODE_ENV !== 'production'`; em produção o servidor recusa subir.
- Expiração preguiçosa no leitor + varredura (`expireStaleOrders()`) chamada ao abrir o painel e por cron opcional.

Schema em [[arquitetura/modelo-de-dados-alvo]]. Fluxos em [[fluxos/pagamento-pix]] e [[fluxos/compra-de-numeros]].
