---
tipo: fluxo
atualizado: 2026-10-09
tags: [numeros, pedido, reserva, produto]
---

# Fluxo: compra de números

## Regras de negócio
- 5.000 números (0001 a 5000), 50 blocos de 100, grade 10x10 por bloco.
- R$ 5 = 10 números. Pacotes sugeridos: R$ 5, 10, 25, 50. Qualquer múltiplo de R$ 5 é aceito até o total disponível.
- Duas modalidades (dois produtos do catálogo, ver [[decisoes/002-produto-antes-do-gateway]]):
  - `cestas-boticario` (modo NUMBERS): participação no sorteio das cestas.
  - `colaboracao-avulsa` (modo EXTRA): valor livre a partir de R$ 5, com centavos, sem números.
- O comprador escolhe números manualmente, "Selecionar aleatoriamente" (substitui a seleção) ou "Completar com disponíveis" (preserva a seleção).
- Números ficam **reservados por 10 minutos** a partir da criação do pedido. Pagamento aprovado confirma; expiração ou estorno libera.

## Passo a passo (produção)
1. Landing `/` → "Quero escolher meus números" leva a `/contribuir?valor=25` (ou `?modalidade=avulsa`).
2. `/contribuir` carrega `GET /api/numeros/ocupados` (lista de inteiros) para pintar a grade. Repete a cada 20 s.
3. Comprador preenche nome, CPF, WhatsApp, e-mail. Validação no cliente (máscara) e no servidor (Zod, dígitos do CPF).
4. Submit → `POST /api/pedidos` com `{ productId, mode, amountCents, numbers[], contributor{...}, idempotencyKey }`.
   - `idempotencyKey` = UUID gerado no cliente ao montar o formulário; reenvio do mesmo formulário devolve o mesmo pedido.
5. Servidor, em **uma transação**:
   a. valida com `validateOrder` (domínio puro);
   b. cria `Contributor` (CPF cifrado) e `Order` (status PENDING, `expiresAt = now + 10 min`, `gateway` do `.env`);
   c. insere `OrderNumber` para cada número com `active = true`. O índice único parcial rejeita números já ativos → erro 409 "Alguns números já estão reservados. Escolha outros." e a transação é desfeita.
6. Fora da transação: chama o gateway (`createPixCharge`) com o título do produto, valor e `external_reference = order.id`. Grava `Payment`. Se o gateway falhar, o pedido vai para CANCELED e os números são liberados (`active = false`).
7. Resposta: `{ orderId, publicToken, expiresAt, pix: { qrCode, qrCodeBase64, ticketUrl } }` → cliente navega para `/pagamento/[orderId]?t=<publicToken>`.
8. Continua em [[fluxos/pagamento-pix]].

## Expiração
- Leitura: qualquer consulta trata `PENDING` com `expiresAt <= now` como `EXPIRED`.
- Escrita: `expireStaleOrders()` atualiza em lote `status = EXPIRED` e `OrderNumber.active = false`. Chamada ao abrir o painel, ao consultar ocupados e por cron opcional (`/api/internal/expirar` com `CRON_SECRET`).
- Renovar Pix: botão em `/pagamento/[id]` quando expirado → `POST /api/pedidos` com os mesmos números (novo pedido, nova verificação de disponibilidade).

## Onde está no código
- Hoje: `src/lib/demo-model.ts` + `src/lib/demo-store.ts` + `src/components/checkout.tsx` + `number-picker.tsx`.
- Alvo: `src/domain/orders.ts`, `src/server/orders.service.ts`, `src/app/api/pedidos/route.ts`.
Tarefas: [[plano/tarefas/T05-dominio-puro]], [[plano/tarefas/T06-servico-de-pedidos]], [[plano/tarefas/T10-checkout-real]].
