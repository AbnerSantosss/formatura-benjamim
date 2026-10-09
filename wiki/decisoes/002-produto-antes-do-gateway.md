---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, produto, gateway, catalogo]
---

# ADR 002 — Todo pedido é um produto antes de ir ao gateway

**Status:** aceita em 2026-10-09.

## Contexto
O dono pediu: "antes de ir pro gateway ele deve ir como um produto". Gateways como Mercado Pago, FastPay e IronPay tratam cobranças como itens com título, quantidade e preço unitário. Além disso, um catálogo permite mudar textos e ativar/desativar modalidades sem deploy.

## Decisão
- Tabela `Product` com `slug`, `title`, `description`, `mode` (NUMBERS | EXTRA), `unitPriceCents`, `active`, `sortOrder`. Seed inicial: `cestas-boticario` (NUMBERS, 50 centavos por número) e `colaboracao-avulsa` (EXTRA).
- `Order.productId` é obrigatório. O domínio valida que o modo do pedido bate com o modo do produto e que o produto está ativo.
- O adapter do gateway recebe `{ order, product }` e monta o item como:
  - NUMBERS: título `"<product.title> — <qtd> números"`, quantidade `qtd`, unitário `product.unitPriceCents`;
  - EXTRA: título `product.title`, quantidade 1, unitário `order.amountCents`.
- `external_reference` (ou equivalente) sempre é `order.id`. Esse é o elo entre gateway e banco.

## Consequências
- O painel ganha a seção **Produtos** (editar título, descrição, ativo). Preço unitário dos números **não** é editável pelo painel depois de existir pedido aprovado (evita inconsistência histórica); é alterado por migração/seed.
- Futuras modalidades (ex.: "cota especial R$ 100") entram como novo produto sem mudar o checkout.

Relacionado: [[arquitetura/modelo-de-dados-alvo]], [[fluxos/compra-de-numeros]].
