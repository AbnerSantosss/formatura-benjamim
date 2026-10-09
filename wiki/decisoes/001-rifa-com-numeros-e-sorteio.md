---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, negocio, sorteio, legal]
---

# ADR 001 — Operar com números e sorteio ("rifa")

**Status:** aceita em 2026-10-09 pelo dono do projeto (Abner).

## Contexto
`CODEX_INSTRUCTIONS.md` e `AGENTS.md` (gerados na fase de frontend) dizem que a landing de produção deve funcionar como "vaquinha familiar sem sorteio pago". O dono, ao pedir a parte funcional, foi explícito: o sistema de compra de números é "algo como uma rifa", com data de sorteio definida por ele e botão **Gerar ganhador** no backoffice.

## Decisão
O pedido do dono prevalece. O sistema opera com:
- venda de números (produto `cestas-boticario`, modo NUMBERS) e colaboração avulsa (produto `colaboracao-avulsa`, modo EXTRA);
- sorteio aleatório auditável entre números de pedidos aprovados ([[fluxos/sorteio]]).

`AGENTS.md` passa a apontar para esta ADR para que nenhum agente futuro "corrija" a direção sem falar com o dono.

## Consequências
- Nenhum agente deve remover a seleção de números, o sorteio ou os textos de "número da sorte" alegando o `CODEX_INSTRUCTIONS.md`.
- **Aviso legal (não é parecer jurídico):** no Brasil, sorteios com contrapartida financeira podem exigir autorização (Lei 5.768/71, Decreto 70.951/72, regulamentação da SPA/Ministério da Fazenda) ou enquadramento como "sorteio filantrópico" por entidade autorizada. Uma campanha familiar pequena costuma operar como "vaquinha com brinde", mas o risco é do organizador. Os textos legais (`/termos`, `/privacidade`, `/regulamento`) devem ser revisados por quem organiza; o plano deixa o texto do regulamento claro sobre critérios de elegibilidade, data, forma de sorteio e contato.
- O dono pode a qualquer momento desligar o sorteio: `Campaign.drawPublic = false` e não clicar em "Gerar ganhador" mantém a campanha como vaquinha pura sem mudança de código.

Relacionado: [[decisoes/006-sorteio-por-csprng-auditavel]], [[analise/estado-atual]].
