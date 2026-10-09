---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, gateway, backoffice, demonstracao]
---

# ADR 016 — Modo demonstração ligado e desligado pelo painel

**Status:** aceita em 2026-10-09. Complementa a [[decisoes/015-credenciais-de-gateway-no-painel]] e a [[decisoes/003-multi-gateway]].

## Contexto
O site foi ao ar com os textos de teste do protótipo ("Pix · demonstração", "Total simulado" etc.) fixos no código, e sem gateway configurado. O dono pediu que esses avisos e o Pix simulado só existam enquanto uma opção do backoffice estiver ligada, que ela venha ligada por padrão, que possa ser desligada com um interruptor, e que, desligada e sem gateway configurado, a pessoa veja um aviso amigável pedindo para avisar os pais em vez do QR Code.

## Decisão
- **Chave:** `Campaign.demoMode` (booleano, padrão `true`; migração `20261009221000_campaign_demo_mode`). Em Configurações, o cartão "Modo demonstração" tem um interruptor (`role="switch"`) que salva na hora por `PATCH /api/admin/configuracoes` (`demoMode`). Quem altera configurações altera a chave; a mudança entra na auditoria como `settings.updated`.
- **Ligada:** o gateway ativo é o `demo` em qualquer ambiente, inclusive produção, mesmo que haja um gateway real configurado e escolhido. As páginas públicas mostram os textos de teste. `/api/demo/aprovar` funciona para pedidos do gateway `DEMO`.
- **Desligada:** os textos de teste somem (landing, `/contribuir`, seletor de números) e vale o gateway real (`Campaign.activeGateway` ou `PAYMENT_GATEWAY`). `/pagamento/[id]` e `/obrigado/[id]` decidem por pedido: um pedido nascido no `demo` continua com os textos de teste.
- **Desligada e sem gateway pronto:** `POST /api/pedidos` responde `503 GATEWAY_NOT_CONFIGURED` **antes** de gravar pedido, reserva ou dado pessoal, e o checkout leva a pessoa para `/pagamento/indisponivel` (ilustração no lugar do QR Code, pedido para avisar os pais, links do Instagram dos pais quando cadastrados).
- **`DEMO_MODE` do ambiente** continua existindo só para desenvolvimento e testes (fora de produção libera o `demo` sem depender do banco). O adapter `demo` não consulta mais nada: quem libera é o registro (`registry.ts`: `demoModeOn`, `demoAllowed`) e a rota de aprovação.
- **Pedido guarda o gateway real de origem:** `Order.gateway` passa a ser o gateway ativo no momento do pedido (antes era sempre `PAYMENT_GATEWAY`).
- **Cache:** a leitura de 10 s de `stored-config.ts` foi para `globalThis`, porque páginas e rotas de API não dividem variáveis de módulo; salvar no painel limpa o cache e o site muda na hora.

## Consequências
- Com a chave ligada em produção, **nenhum Pix real é gerado** e qualquer visitante consegue "aprovar" o próprio pedido de teste. Esses pedidos aparecem no painel, contam no arrecadado e ocupam números até serem estornados. Antes de divulgar a campanha: desligar a chave e estornar os aprovados de teste.
- Um banco sem a linha da campanha conta como chave desligada (nada de Pix simulado por omissão).
- A descrição do produto no banco ainda diz "demonstração sem cobrança ou sorteio real"; ela é editável em Produtos e não muda com a chave.
- As telas `/`, `/contribuir`, `/pagamento/[id]` e `/obrigado/[id]` ganharam textos alternativos; estrutura e CSS seguem iguais. Com a chave ligada os snapshots visuais não mudam.
