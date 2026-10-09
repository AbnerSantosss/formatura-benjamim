---
tipo: analise
atualizado: 2026-10-09
tags: [analise, diagnostico, riscos]
---

# Análise do estado atual (2026-10-09)

## Resumo
O projeto é um **protótipo frontend completo e bem resolvido visualmente**, mas sem nenhuma peça de backend. Tudo que parece "funcionar" (reserva, aprovação, painel) vive no `localStorage` do navegador de quem testa. Para produção é preciso construir banco, API, autenticação, gateway, e-mail e sorteio. O visual e a lógica de domínio pura podem ser reaproveitados integralmente.

## O que existe e está bom
- Landing, checkout, seletor de números (grade 10x10, aleatório, completar, limpar), tela Pix, agradecimento e backoffice, responsivos e com acessibilidade básica. Capturas em `revisao/`.
- Lógica de domínio pura em `demo-model.ts` com 12 testes passando (`npm test`): pacotes, validação, reserva, expiração, transições, totais, migração. É a base do `src/domain/orders.ts`.
- Catálogo com dois produtos e todo pedido vinculado a produto, exatamente o que o dono pediu ("antes de ir pro gateway ele deve ir como um produto").
- TypeScript strict, ESLint, build passam (`npm run typecheck`, `npm run lint`, `npm run build`).

## O que falta (lacunas para produção)
| Área | Hoje | Necessário |
|---|---|---|
| Persistência | localStorage, limite 1.000 pedidos | PostgreSQL + Prisma |
| Reserva de números | por navegador | transacional no banco (índice único parcial) |
| Pagamento | simulado, QR falso | Mercado Pago Orders API Pix, webhook assinado |
| Gateways alternativos | nenhum | FastPay e IronPay como adapters pré-configurados |
| Login admin | `admin` / `benjamim123` no cliente | e-mail + senha, bcrypt, sessão em banco, lembrar, esqueci |
| Multiusuário | não | convite por e-mail com link para definir senha |
| E-mail | nenhum | SMTP + templates profissionais |
| Sorteio | nenhum | botão "Gerar ganhador" com data e auditoria |
| Arrecadado público | `campaign.raised = 0` fixo | agregado do banco com revalidação 30 s |
| Rotas de API | impossíveis (`output: 'export'`) | remover export, Route Handlers |
| Hospedagem | estático (`.openai/hosting.json`) | servidor Node + Postgres (Docker em VPS) |
| Segurança | nenhuma | headers, rate limit, CPF cifrado, PII fora dos logs |
| Testes | 12 unitários | + integração (banco, webhook, concorrência) + smoke E2E |

## Riscos e armadilhas encontradas
1. **`output: 'export'`** em `next.config.ts` bloqueia `POST` em Route Handlers. Primeira coisa a remover.
2. **Código em uma linha por arquivo.** Qualquer edição cirúrgica falha. Formatar com Prettier antes (T00) e commitar a formatação separadamente.
3. **Conflito de direção**: `CODEX_INSTRUCTIONS.md` e `AGENTS.md` proíbem sorteio pago; o dono decidiu operar números + sorteio. Registrado em [[decisoes/001-rifa-com-numeros-e-sorteio]]; `AGENTS.md` foi atualizado para apontar a decisão, para que nenhum agente "corrija" a direção por conta própria.
4. **Next 16**: `middleware` virou `proxy`; APIs de request assíncronas; `next lint` não existe. Detalhes em [[arquitetura/stack]].
5. **Mercado Pago**: a API muda. O executor deve conferir os campos na documentação oficial antes de codar e gravar o payload exato na wiki ([[integracoes/mercado-pago]]). Nunca expor `MP_ACCESS_TOKEN` no cliente.
6. **Expiração**: não há cron no protótipo nem na VPS por padrão. Solução: expiração preguiçosa + varredura ao abrir o painel + endpoint protegido para cron opcional.
7. **`contribution.tsx`** não é usado; `demo.css` tem estilos do banner de demonstração que precisam sair do layout.
8. **Fuso horário**: o painel usa `America/Fortaleza`; manter o mesmo para `drawAt`.
9. **Chaves de gateway** ainda não existem. Tudo deve "falhar fechado": sem credenciais, o botão de pagar mostra "Pagamentos em configuração" e nenhuma cobrança falsa é gerada.

## Decisões tomadas nesta análise
Ver [[decisoes/004-stack-de-producao]], [[decisoes/005-autenticacao-propria]], [[decisoes/006-sorteio-por-csprng-auditavel]], [[decisoes/007-orquestracao-por-modelo]].

## Próximo passo
Executar [[plano/plano-de-producao]] com o [[plano/orquestrador]].
