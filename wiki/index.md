---
tipo: indice
atualizado: 2026-10-09
tags: [wiki, indice]
---

# Wiki — Formatura do Benjamim

Site de arrecadação para a formatura do ABC do Benjamim. O plano de produção (T00 a T23) está concluído: Next.js 16 com PostgreSQL e Prisma, autenticação própria, compra de números com produto, Pix pelo Mercado Pago (adapter ainda não testado com credenciais reais; FastPay e IronPay são stubs) e sorteio no painel. Falta a T24 (deploy na VPS), que depende do dono.

Leia primeiro: [[analise/estado-atual]] → [[plano/plano-de-producao]] → [[decisoes/001-rifa-com-numeros-e-sorteio]].

## Arquitetura
- [[arquitetura/stack]] — Next 16.4, React 19.3, TS 6, CSS puro, Lucide. O que muda no Next 16.
- [[arquitetura/estrutura-de-pastas]] — mapa de cada arquivo do projeto e o que ele faz.
- [[arquitetura/modelo-de-dados-atual]] — modelo do protótipo (`demo-model.ts`): pedidos, números, status.
- [[arquitetura/arquitetura-alvo]] — arquitetura de produção: Postgres + Prisma, rotas de API, gateways, auth, e-mail.
- [[arquitetura/modelo-de-dados-alvo]] — schema Prisma completo (tabelas, índices, constraints).

## Fluxos
- [[fluxos/compra-de-numeros]] — pacotes (R$ 5 = 10 números), grade 10×10, reserva de 10 min, produto antes do gateway.
- [[fluxos/pagamento-pix]] — criação do pedido, cobrança Pix, webhook, confirmação, expiração, estorno.
- [[fluxos/backoffice]] — login, usuários, pedidos, produtos, configurações, CSV.
- [[fluxos/sorteio]] — "Gerar ganhador": data do sorteio, elegíveis, aleatoriedade auditável, comunicação.
- [[fluxos/autenticacao-admin]] — login, lembrar senha, esqueci senha, convite por e-mail.

## Decisões (ADRs)
- [[decisoes/001-rifa-com-numeros-e-sorteio]] — o dono decidiu operar números + sorteio (substitui a regra "sem sorteio" do CODEX_INSTRUCTIONS).
- [[decisoes/002-produto-antes-do-gateway]] — todo pedido referencia um produto do catálogo antes de ir ao gateway.
- [[decisoes/003-multi-gateway]] — interface única; Mercado Pago implementado, FastPay e IronPay pré-configurados.
- [[decisoes/004-stack-de-producao]] — Postgres + Prisma, servidor Node (sem export estático), Docker.
- [[decisoes/005-autenticacao-propria]] — sessão em banco + bcrypt, sem NextAuth.
- [[decisoes/006-sorteio-por-csprng-auditavel]] — como o ganhador é escolhido.
- [[decisoes/007-orquestracao-por-modelo]] — por que cada tarefa tem um modelo de IA definido.
- [[decisoes/008-portas-do-postgres-local]] — Postgres local em 5442 (dev) e 5443 (teste), porque 5432/5433 já estão em uso na máquina.
- [[decisoes/009-ajustes-de-consistencia-do-schema]] — meta R$ 2.500, `unitCents`, campanha `main` e outras divergências do plano resolvidas na execução.
- [[decisoes/010-contratos-reais-da-janela-b]] — build sem segredos de produção, assinaturas reais de pedidos, auth e e-mail; pendências do dono.
- [[decisoes/011-progress-e-footer-recebem-dados-por-prop]] — `Progress` e `Footer` deixam de ler `campaign.ts`; cada página repassa os dados do banco.
- [[decisoes/012-snapshots-visuais-a-partir-do-estado-validado]] — snapshots do Playwright nascem do estado atual, já comparado com a baseline; `revisao/baseline/` segue como referência humana.
- [[decisoes/013-override-do-deepmerge-ts]] — `overrides` do npm fixa `deepmerge-ts` 8 (dependência do Prisma) para o `npm audit` de produção ficar sem altas.
- [[decisoes/015-credenciais-de-gateway-no-painel]] — chaves e escolha do gateway pelo backoffice, cifradas no banco; o `.env` vira reserva.
- [[decisoes/014-build-sem-banco-e-imagem-de-ferramentas]] — o build do Docker não usa banco (páginas públicas renderizadas a cada visita) e migração, seed e admin rodam pela imagem `tools`.

## Integrações
- [[integracoes/mercado-pago]] — Orders API Pix, webhook `x-signature`, estorno, sandbox.
- [[integracoes/fastpay]] — stub pré-configurado, variáveis, o que falta.
- [[integracoes/ironpay]] — stub pré-configurado, variáveis, o que falta.
- [[integracoes/email]] — SMTP via Nodemailer, templates (convite, redefinição, confirmação, ganhador).

## Operação
- [[operacao/como-executar]] — comandos de desenvolvimento, testes, build.
- [[operacao/variaveis-de-ambiente]] — todas as variáveis, obrigatórias por ambiente.
- [[operacao/deploy]] — Docker Compose em VPS com HTTPS; alternativa Vercel + Neon.
- [[operacao/checklist-producao]] — o que conferir antes de ligar cobrança real.
- [[operacao/seguranca]] — cabeçalhos, CSP, IP do cliente e limites, resultado da revisão de segurança (T22).

## Análise
- [[analise/estado-atual]] — o que existe, o que falta, riscos e dívidas encontradas em 2026-10-09.

## Plano
- [[plano/plano-de-producao]] — visão geral, fases, dependências, modelo por tarefa.
- [[plano/orquestrador]] — prompt do agente orquestrador (copiar e colar).
- [[plano/tarefas/T00-preparacao]] até [[plano/tarefas/T24-deploy]] — uma tarefa por arquivo, escrita para execução literal.

## Registro
- [[log]] — log curado de tudo que foi feito.
- `registro/sessoes/` (fora da wiki) — registro automático bruto por sessão.
