---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, sorteio, auditoria]
---

# ADR 006 — Sorteio por CSPRNG com registro auditável

**Status:** aceita em 2026-10-09.

## Opções
| Opção | Prós | Contras |
|---|---|---|
| Loteria Federal | externo, verificável por todos | depende de data de extração, leitura manual, regras de dígitos para 5.000 números |
| `Math.random()` | simples | não criptográfico, não auditável |
| **`crypto.randomInt` + hash dos participantes + seed gravada** | um clique, imparcial, registro completo | verificação depende de confiar no registro do sistema |
| Commit-reveal com hash publicado antes | mais transparente | complexidade desnecessária para campanha familiar |

## Decisão
- `Draw` grava `eligibleCount`, `participantsHash` (sha256 da lista ordenada `numero:orderId`), `seedHex`, `winnerNumber`, `winnerOrderId`, `drawnById`, `drawnAt`, `forced`.
- O índice vencedor vem de `crypto.randomInt(0, eligibleCount)`. A `seedHex` é gravada como evidência de entropia, não para reproduzir o sorteio (o `randomInt` não é semeável). Para reprodutibilidade total, a função pura `pickWinner(participants, randomInt)` é testada com `randomInt` injetado.
- O domínio puro fica em `src/domain/draw.ts` e é coberto por testes: lista vazia → erro; índice dentro do intervalo; hash estável independente da ordem de entrada (ordenar antes).
- O painel exibe o registro completo do sorteio (incluindo hash) para que o dono possa publicar, se quiser, uma captura como comprovante.

## Consequências
- Um único sorteio válido por campanha; refazer exige anulação justificada ([[fluxos/sorteio]]).
- E-mails automáticos ao ganhador e aos admins; dados pessoais do ganhador nunca vão para a landing pública.
