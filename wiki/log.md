# Log da wiki

Formato: `## [AAAA-MM-DD] <tipo> | <resumo>` — tipos: setup, ingest, query, lint, update, fix, plano, entrega.

## [2026-10-09] setup | Criação da wiki e análise do protótipo

**Pedido.** Gerar uma wiki linkando todo o projeto, com log de tudo que é feito; analisar o projeto e preparar a ida para produção (Mercado Pago funcional, backoffice com "Gerar ganhador", login admin com lembrar/esqueci senha, convite de admins por e-mail profissional, compra de números como produto antes do gateway, Mercado Pago + FastPay + IronPay pré-configurados); montar plano com agente orquestrador, subagentes e modelo de IA por tarefa, escrito para uma IA "burra" executar.

**O que foi feito.**
- Varredura completa: `package.json`, `next.config.ts`, `src/` (16 componentes e libs), `tests/demo.test.mjs`, `README.md`, `CODEX_INSTRUCTIONS.md`, `AGENTS.md`, `.env.example`, docs do Next 16 em `node_modules/next/dist/docs`.
- Criada a estrutura `wiki/` com índice, log, arquitetura, fluxos, decisões, integrações, operação, análise e plano.
- Registradas 7 decisões (ADRs), incluindo a mudança de direção: o dono decidiu operar números + sorteio ([[decisoes/001-rifa-com-numeros-e-sorteio]]).
- Escrito o plano de produção em 24 tarefas com modelo por tarefa ([[plano/plano-de-producao]]).
- Criado `CLAUDE.md` na raiz com regra de leitura da wiki; `AGENTS.md` atualizado para apontar a decisão 001.

**Entregue.** Wiki navegável, análise em [[analise/estado-atual]], plano executável em `wiki/plano/`.

**Armadilhas registradas.**
- `output: 'export'` no `next.config.ts` impede rotas de API com `Request`; precisa sair antes de qualquer backend.
- No Next 16, `middleware.ts` virou `proxy.ts`; `next lint` foi removido; APIs de request são só assíncronas.
- O código do protótipo está todo em uma linha por componente; antes de editar, formate com Prettier (tarefa T00).
- `.openai/hosting.json` publica apenas `out/` estático; não serve para produção com servidor.

## [2026-10-09] plano | Plano de produção completo (T00–T24), e-mail e admin inicial configurados

**Pedido.** Fechar o plano executável: todas as tarefas em arquivo; credenciais do provedor de e-mail já no `.env` com remetente "BENJAMIM ABC"; admin inicial definido com senha temporária; design da landing, checkout e obrigado intocável; subagentes nunca em Fable (só Opus ou Haiku 5.5).

**O que foi feito.**
- Escritos os 25 arquivos `wiki/plano/tarefas/T00-preparacao.md` … `T24-deploy.md`, cada um com Modelo, Depende de, Arquivos, Passos literais, Critério de aceite (comandos) e Não fazer.
- Mapa de modelos revisado em [[decisoes/007-orquestracao-por-modelo]], [[plano/plano-de-producao]] e [[plano/orquestrador]]: `haiku` para T01, T02, T09, T12, T13, T15a, T23; `opus` para o resto; Fable só no orquestrador. Sonnet removido.
- Regra de design intocável incorporada ao prompt do orquestrador, às tarefas T09–T13, T21 (snapshots Playwright) e T22 (conferência final contra `revisao/baseline/`, capturada em T00).
- `.env` (local, ignorado pelo git) recebeu SMTP do Gmail com `MAIL_FROM="BENJAMIM ABC <...>"` e `ADMIN_BOOTSTRAP_EMAIL/NAME/PASSWORD`; `.env.example` ganhou as chaves vazias. [[operacao/variaveis-de-ambiente]] e [[fluxos/autenticacao-admin]] documentam `mustChangePassword` e a troca obrigatória no primeiro login (`/admin/trocar-senha`, T14/T17).
- `registro/` adicionado ao `.gitignore` (o registro automático guarda os pedidos na íntegra).
- Criados `CLAUDE.md` e `GEMINI.md` na raiz; `AGENTS.md` aponta a ADR 001 e marca o texto "sem sorteio" como desatualizado.

**Entregue.** Plano pronto para o orquestrador: `wiki/plano/orquestrador.md` (prompt) + `wiki/plano/tarefas/*`. Nenhum código de produção foi escrito nesta etapa; nenhum teste rodado.

**Armadilhas registradas.**
- Vários heredocs numa única chamada de shell falharam com `unexpected EOF`; um arquivo por chamada resolveu.
- A senha temporária do admin passou pelo chat e, portanto, pelo registro automático; por isso `registro/` ficou fora do git e a senha nunca deve ser impressa de novo. Trocar no primeiro login.
- O log anterior dizia que `CLAUDE.md` já existia; não existia. Corrigido nesta entrada.

## [2026-10-09] update | Retomada preparada para execução do plano em nova sessão
- Pedido: registrar o plano na wiki e preparar a próxima janela para executar como orquestrador (Fable) com subagentes Opus/Haiku 5.5.
- O que foi feito: bloco "Início rápido" em [[plano/orquestrador]] com o ambiente já verificado (Node 24, Docker ativo, Playwright já instalado, testes em `node:test`); gatilho em `CLAUDE.md`/`GEMINI.md` para a sessão assumir o papel de orquestrador sem confirmação.
- Entregue: próxima sessão começa pela T00 direto.
- Armadilhas: nenhuma tarefa do plano foi executada ainda; `wiki/plano/status.md` ainda não existe (T00 cria).

## [2026-10-09] update | Fase 0 concluída (T00–T04) e T05
- Pedido: executar o plano de produção como orquestrador (subagentes só em `haiku`/`opus`).
- O que foi feito: T00 pelo orquestrador (commit do protótipo, branch `producao`, Prettier, Vitest, baseline visual em `revisao/baseline/`, `wiki/plano/status.md`). Janela A em paralelo: T01 (`output: 'standalone'`, sem barra final), T02 (Dockerfile, Compose, Caddy), T03 (schema Prisma 6, migração com índice único parcial, seed), T04 (`src/server/env.ts` com Zod), T05 (`src/domain/*` e testes).
- Entregue: `npm run typecheck`, `npm run lint`, `npm test` (40 testes) e `npm run build` verdes; `npx prisma migrate status` em dia; `docker compose ps` com `db` saudável em 127.0.0.1:5442. Um commit por tarefa.
- Armadilhas: portas 5432/5433 já ocupadas por outros projetos da máquina → [[decisoes/008-portas-do-postgres-local]]. O plano se contradizia em meta (R$ 25.000 × R$ 2.500), `unitPriceCents` × `unitCents` e id da campanha → [[decisoes/009-ajustes-de-consistencia-do-schema]]. O npm da máquina bloqueia scripts de pós-instalação: rodar `npx prisma generate` à mão depois de `npm install`. O Chromium do Playwright estava em versão antiga; `npx playwright install chromium` resolveu. `npm install` em paralelo por vários subagentes corromperia o lockfile: o orquestrador instala os pacotes antes de abrir cada janela.
