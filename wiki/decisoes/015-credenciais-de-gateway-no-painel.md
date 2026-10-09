---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, gateway, backoffice, seguranca]
---

# ADR 015 — Credenciais e escolha do gateway pelo painel

**Status:** aceita em 2026-10-09. Complementa a [[decisoes/003-multi-gateway]].

## Contexto
O dono pediu para cadastrar a chave do Mercado Pago (e dos outros gateways) no backoffice, sem editar variáveis no servidor. Até aqui as credenciais só existiam no `.env` e o app se recusava a subir em produção sem `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`.

## Decisão
- **Tela:** Configurações → "Gateways de pagamento", um cartão para cada um dos três (Mercado Pago, FastPay, IronPay), com os campos já prontos, o endereço do webhook, "Salvar credenciais" e "Usar este gateway". Só o papel `OWNER` vê e altera; os demais continuam com o cartão de leitura.
- **Campos** (`src/domain/gateway-fields.ts`): Mercado Pago = `accessToken`, `webhookSecret` (segredos) e `publicKey`; FastPay e IronPay = `apiUrl` (https), `apiKey`, `webhookSecret`.
- **Banco:** tabela `GatewayConfig` (uma linha por gateway, coluna `secretsEnc`) e `Campaign.activeGateway` (nulo = vale `PAYMENT_GATEWAY`).
- **Cifra:** AES-256-GCM com chave derivada (HKDF, rótulo `gateway-config-v1`) da `CPF_ENCRYPTION_KEY`. Não há variável nova. Trocar a `CPF_ENCRYPTION_KEY` invalida o que foi salvo: o gateway volta a aparecer como sem credenciais e é preciso salvar de novo.
- **Precedência:** por campo, o que foi salvo no painel vale no lugar da variável de ambiente. Apagar o campo no painel devolve a vez à variável. O gateway em uso é o escolhido no painel; sem escolha, `PAYMENT_GATEWAY`.
- **Nunca sai:** a API (`GET`/`PATCH /api/admin/gateways`) devolve, para cada campo, só "preenchido ou não" e a origem (`painel` ou `ambiente`); valor apenas de campo que não é segredo. A auditoria (`gateway.updated`) grava só o nome dos campos mexidos.
- **Ativação:** só gateway com integração pronta e credenciais completas. FastPay e IronPay guardam as chaves, mas a ativação é recusada (422) enquanto os adapters forem esqueleto. O `demo` não é configurável nem ativável pelo painel.
- **Ambiente:** `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` deixam de ser obrigatórias em produção (viram aviso). Sem credencial no painel nem no ambiente, criar pedido responde `503 GATEWAY_NOT_CONFIGURED`, como antes.
- **Registro assíncrono:** `getGateway`, `getGatewayById` e `gatewayHealth` passaram a `async`, porque consultam o banco. A leitura fica em memória por 10 s (`stored-config.ts`) e é descartada ao salvar.

## Consequências
- Um vazamento do banco sozinho não expõe as chaves; banco **e** `CPF_ENCRYPTION_KEY` juntos, sim. O backup do banco passa a conter credenciais cifradas.
- Com mais de uma instância do app, a troca feita no painel leva até 10 s para valer nas outras (hoje há uma só).
- Pedidos antigos seguem no gateway em que nasceram (`Order.gateway`): webhook e estorno usam `getGatewayById`.
- `MP_API_FLAVOR` e `MP_ENVIRONMENT` continuam só no ambiente.
