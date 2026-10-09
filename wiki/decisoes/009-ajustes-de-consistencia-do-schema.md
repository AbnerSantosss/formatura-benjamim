---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, schema, prisma, meta, nomes]
---

# ADR 009 — Ajustes de consistência entre o plano e o schema (janela A)

**Status:** aceita em 2026-10-09 pelo orquestrador, ao aceitar T03 e T05. O item 1 (meta) fica **sujeito à confirmação do dono**.

## Contexto
Ao executar T03 e T05 apareceram divergências entre páginas do próprio plano. Nenhuma tarefa pode seguir "literalmente" dois textos que se contradizem, então fica registrado aqui qual vale.

## Decisão
1. **Meta da campanha: `250000` centavos (R$ 2.500), não `2500000`.** O protótipo (`src/lib/campaign.ts`, `demo-model.ts`), a baseline visual e o `@default` do schema usam R$ 2.500, que é exatamente 5.000 números × R$ 0,50. O valor `2500000` (R$ 25.000) em T03, `.env.example` e [[operacao/variaveis-de-ambiente]] tinha um zero a mais e mudaria o texto da landing. O seed, o `.env` local, o `.env.example` e a linha já gravada no banco de desenvolvimento foram corrigidos. A meta continua editável no backoffice.
2. **Preço unitário do produto: o campo é `Product.unitCents`.** T07, T18 e a ADR 002 dizem `unitPriceCents`; onde aparecer, leia `unitCents`.
3. **Produto EXTRA tem `unitCents = 0`.** "Valor livre" se testa por `mode === 'EXTRA'`, nunca por `unitCents === null`.
4. **A campanha única tem id `main`** (o `@default("principal")` do schema nunca é usado). Todo código lê a campanha com `id: 'main'`.
5. **Instagram: os campos são `Campaign.instagramFather` e `Campaign.instagramMother`**, `String` não nulo; vazio (`""`) significa "sem link".
6. **`Product.sortOrder`** (`Int @default(0)`) existe no schema real, assim como os demais campos listados em "Desvios registrados" da T03. O schema em `prisma/schema.prisma` é a verdade; [[arquitetura/modelo-de-dados-alvo]] é o desenho original.
7. **Validação de pedido em duas camadas.** `newOrderSchema` (Zod, `src/domain/validation.ts`) valida formato e teto de R$ 100.000; o mínimo de R$ 5, a regra de pacotes de R$ 5 e a disponibilidade ficam em `validateOrder` (`src/domain/orders.ts`). O serviço de pedidos (T06) **precisa chamar as duas**.
8. **O domínio aceita `PENDING → CANCELED`**, além das transições do protótipo.

## Pendência conhecida
A descrição do produto `cestas-boticario` foi semeada com o texto do protótipo ("…demonstração sem cobrança ou sorteio real"). É falso em produção e pode ir ao gateway como descrição do item. Trocar antes de ligar cobrança real (T13 cuida dos textos; conferir na T22).

Relacionado: [[decisoes/002-produto-antes-do-gateway]], [[plano/tarefas/T03-prisma-schema]], [[plano/tarefas/T05-dominio-puro]].
