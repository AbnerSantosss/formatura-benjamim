---
tipo: fluxo
atualizado: 2026-10-10
tags: [pix, mercado-pago, webhook, pagamento]
---

# Fluxo: pagamento Pix

```
Checkout ──POST /api/pedidos──▶ orders.service.createOrder
                                   │ (transação: Contributor + Order + OrderNumber)
                                   ▼
                              gateway.createPixCharge(order)  ──▶ Mercado Pago
                                   │ Payment { qrCode, qrCodeBase64, providerOrderId }
                                   ▼
/pagamento/[id]  ◀── QR + copia e cola + cronômetro (expiresAt)
      │ polling GET /api/pedidos/[id]/status?t=token a cada 5 s
      ▼
Mercado Pago ──POST /api/webhooks/mercadopago──▶ valida x-signature
                                                  grava WebhookEvent (único)
                                                  GET server-to-server da order/pagamento
                                                  confere valor + external_reference + status
                                                  orders.service.approve(orderId)  (idempotente)
      ▼
/pagamento/[id] vê APPROVED ──▶ redireciona /obrigado/[id]?t=token (servidor confere de novo)
```

## Estados do pedido
| Status | Entra em | Sai para | Números |
|---|---|---|---|
| PENDING | criação | APPROVED, EXPIRED, CANCELED | ativos (reservados) |
| APPROVED | webhook/consulta confirmada | REFUNDED | ativos (confirmados) |
| EXPIRED | `expiresAt` passou sem aprovação | nenhum | liberados |
| CANCELED | gateway falhou ao criar cobrança | nenhum | liberados |
| REFUNDED | admin estornou | nenhum | liberados |

Transições são monotônicas e idempotentes: aprovar um pedido já aprovado não faz nada; aprovar um expirado é rejeitado (o webhook registra "pagamento recebido após expiração" para o admin estornar manualmente).

## Garantias
- **Nunca** confirmar pelo cliente: só o webhook ou uma consulta server-to-server muda para APPROVED.
- Webhook valida assinatura HMAC em tempo constante, grava `WebhookEvent` com chave única e só então processa. Repetições e eventos fora de ordem não duplicam nada.
- Valor pago deve ser igual a `amountCents`; divergência vira `AuditLog` + status mantido + aviso no painel.
- Em `DEMO_MODE=true` fora de produção, ou com o **modo demonstração ligado no painel** (`Campaign.demoMode`, padrão ligado, vale também em produção: [[decisoes/016-modo-demonstracao-no-painel]]), o gateway `demo` devolve um QR falso e a tela mostra "Simular aprovação", que chama `POST /api/demo/aprovar` (sem demonstração liberada a rota responde 404). Modo demonstração desligado e nenhum gateway pronto: `POST /api/pedidos` responde `503 GATEWAY_NOT_CONFIGURED` antes de gravar pedido, reserva ou dado pessoal, e o checkout abre `/pagamento/indisponivel` (aviso para falar com os pais, no lugar do QR Code).

## Tela `/pagamento/[id]`
- Server Component busca o pedido pelo `id` e confere o `t` (publicToken). Token errado → 404.
- Mostra: total, cronômetro, QR (`<img src="data:image/png;base64,...">`), copia e cola com botão copiar, produto e números, estado.
- Client Component faz polling do status; ao receber `APPROVED`, `router.replace('/obrigado/[id]?t=...')`.
- Expirado: botão "Gerar novo Pix" (ver [[fluxos/compra-de-numeros]] "Renovar").

## Estorno
- Painel → "Estornar" → `POST /api/admin/pedidos/[id]/estornar` → `gateway.refund(payment)` → se OK: `REFUNDED`, números liberados, `AuditLog`. Mercado Pago: `POST /v1/payments/{id}/refunds` ([[integracoes/mercado-pago]]).

Tarefas: [[plano/tarefas/T07-gateways]], [[plano/tarefas/T08-rotas-api-publicas]], [[plano/tarefas/T11-tela-pagamento-real]].
