---
tipo: fluxo
atualizado: 2026-10-09
tags: [sorteio, ganhador, auditoria]
---

# Fluxo: sorteio ("Gerar ganhador")

## Regras
- O admin define `Campaign.drawAt` (data e hora, fuso `America/Fortaleza`) nas Configurações.
- Elegíveis: todos os `OrderNumber` com `active = true` cujo `Order.status = APPROVED` no momento do sorteio. Pedidos pendentes, expirados ou estornados não participam.
- Cada **número** tem a mesma chance. Quem comprou mais números tem mais chances, como numa rifa comum.
- O botão **Gerar ganhador** no painel:
  - fica desabilitado antes de `drawAt` (mostra contagem regressiva);
  - fica habilitado a partir de `drawAt`;
  - OWNER pode forçar antes da data marcando "Sei que ainda não é a data" (gera `AuditLog` com `forced: true`).
- Só existe **um** sorteio válido. Para refazer, o OWNER precisa anular o anterior (`Draw.notes` com justificativa) e isso fica registrado.

## Algoritmo (`src/domain/draw.ts`, puro)
```
entrada: participantes = [{ number, orderId }] ordenados por number, seed = 32 bytes
1. participantsHash = sha256(participantes.map(p => `${p.number}:${p.orderId}`).join('\n'))
2. índice = inteiro uniforme em [0, participantes.length) derivado de seed:
     usar crypto.randomInt(participantes.length) no serviço; no domínio puro, receber
     a função `randomInt(max)` como parâmetro para ser testável.
3. ganhador = participantes[índice]
saída: { winnerNumber, winnerOrderId, participantsHash, eligibleCount }
```
- O serviço (`draw.service.ts`) gera `seedHex = randomBytes(32).toString('hex')`, chama o domínio dentro de uma transação, grava `Draw` e `AuditLog`.
- Resultado mostrado ao admin: número, nome do comprador, e-mail e WhatsApp (dados completos só no painel).
- E-mails: para o ganhador (template "ganhador") e para todos os OWNER/ADMIN (template "sorteio-realizado").
- Se `Campaign.drawPublic = true`, a landing mostra "Número sorteado: 0123 — parabéns, <primeiro nome>!" (nunca sobrenome, CPF, telefone ou e-mail).

## Por que não "Loteria Federal"
Vincular à Loteria Federal exigiria data fixa e leitura manual do resultado. CSPRNG do Node com hash dos participantes e seed gravados dá auditoria suficiente para uma campanha familiar e funciona com um clique. Ver [[decisoes/006-sorteio-por-csprng-auditavel]].

Tarefa: [[plano/tarefas/T20-sorteio]].
