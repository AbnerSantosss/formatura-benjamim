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

## [2026-10-09] update | Fases 1 e 2 concluídas (T05–T08) e auth até T16
- Pedido: executar o plano de produção como orquestrador.
- O que foi feito: janela B em paralelo: T06 (serviço de pedidos, cifra de CPF, auditoria, testes de integração), T07 (contrato de gateways, demo, esqueletos FastPay/IronPay, adapter Mercado Pago pela documentação oficial), T14 (sessão, `proxy.ts`, login, troca de senha, `admin:create`), T15 (templates e transporte de e-mail). Janela C: T08 (rotas públicas e webhooks) e T16 (esqueci senha, redefinir, convite).
- Entregue: `npm run typecheck`, `npm run lint`, `npm test` (84), `npm run test:integration` (84) e `npm run build` verdes, rodados pelo orquestrador. Um commit por tarefa.
- Armadilhas: `next build` quebrava com o `.env` de demonstração porque `env.ts` aplicava as regras de produção no build; agora valem só quando o servidor sobe. Testes da T16 chegaram a usar o SMTP real (o Prisma Client carrega o `.env` local): cerca de 13 e-mails para endereços inexistentes; corrigido com trava no setup dos testes. Suítes de integração de dois agentes no mesmo banco geram falhas espúrias: o orquestrador valida em série. O Mercado Pago exige Pix com vencimento mínimo de 30 minutos, contra reserva de 10. Tudo em [[decisoes/010-contratos-reais-da-janela-b]], inclusive as decisões que aguardam o dono (reserva × vencimento do Pix, senha inicial do admin fora da política, preço fixo no código).

## [2026-10-09] update | Fase 3 concluída (T09–T13), telas e API do admin (T17, T18)
- Pedido: executar o plano de produção como orquestrador.
- O que foi feito: janela D em paralelo: T09 (landing lê arrecadação, meta e ganhador do banco), T10 (checkout cria pedido pela API e lê os números ocupados do servidor), T11 (`/pagamento/[id]` com pedido real, QR do gateway e consulta de status), T12 (`/obrigado/[id]` com pedido do banco), T17 (telas de login, troca de senha, redefinição e convite), T18 (API do painel e e-mail de pedido confirmado). Depois a T13 (banner removido, `demo.css` incorporado a `globals.css`, termos, privacidade e regulamento).
- Entregue: `npm run typecheck`, `npm run lint`, `npm test` (84), `npm run test:integration` (100) e `npm run build` verdes, rodados pelo orquestrador. Capturas novas de `/`, `/contribuir`, `/pagamento/[id]` e `/obrigado/[id]` (1280 e 390 px) comparadas com `revisao/baseline/`: mesmas dimensões e layout, mudando só os dados, o botão "Preencher dados de teste" (removido pela T10) e o banner do topo (removido pela T13). Um commit por tarefa.
- Armadilhas: `Progress` e `Footer` liam `campaign.ts` e servem várias páginas → [[decisoes/011-progress-e-footer-recebem-dados-por-prop]]. `demo.css` não era só do banner: tinha 1.100 linhas de estilo do checkout, pagamento, login e backoffice. O dev server lê o `.env` e a aprovação demo já envia e-mail: subir o servidor de desenvolvimento com `SMTP_HOST=127.0.0.1 SMTP_PORT=1025` (Mailpit) para não usar o SMTP real. Depois de mover ou remover páginas, `npx next typegen` antes do `typecheck`. No Windows, parar o `npm run dev` não mata o processo do Next: conferir a porta.
- Pendências do dono: os textos de demonstração dentro da landing, do checkout e do obrigado continuam ("Tudo acontece em modo de demonstração", "Nenhum Pix real será gerado", "Total simulado", "Pix aprovado na demonstração"); trocar muda o texto das páginas protegidas. Também: textos de produção da tela de pagamento, link "Ver no backoffice" nas telas públicas, link para `/regulamento` no rodapé, título do produto ("Cestas O Boticário" no banco × "Cestas Boticário — participação no sorteio" no protótipo), rotina de anonimização em 90 dias prometida na privacidade.

## [2026-10-09] update | Fases 4 e 5 concluídas (T14–T20): painel ligado à API e sorteio
- Pedido: executar o plano de produção como orquestrador.
- O que foi feito: T19 (backoffice lê e grava pela API: pedidos com busca, filtros, paginação, estorno e CSV; produtos; usuários com convite; configurações; diálogo de confirmação próprio; `demo-store.ts` e `product-catalog.tsx` removidos). T20 (sorteio: domínio puro em `src/domain/draw.ts`, serviço com trava `FOR UPDATE` na campanha, rotas `/api/admin/sorteio` e `/anular`, card "Gerar ganhador" com antecipação e anulação só para OWNER, e-mails ao ganhador e aos admins).
- Entregue: `npm run typecheck`, `npm run lint` (0 erros, 2 avisos conhecidos em `admin-client.ts`), `npm test` (91), `npm run test:integration` (120) e `npm run build` verdes, rodados pelo orquestrador. CSS e JSX das páginas públicas sem alteração. Um commit por tarefa.
- Armadilhas: o `Draw` do schema não tem `forced`/`drawnById`/`drawnAt` como o ADR 006 diz; a marca de antecipado vive no `AuditLog`. O overlay de desenvolvimento do Next também tem `role="dialog"`: em testes, selecionar o diálogo pela classe. Admins e sorteios criados para teste manual precisam ser removidos do banco de dev (com `drawPublic` ligado, um sorteio de teste apareceria na landing).
- Pendências do dono: o que fazer quando o pedido vencedor é estornado depois do sorteio (hoje nada acontece); reenvio do e-mail do ganhador e aviso de anulação não existem; coluna "Contribuinte", contagens na visão geral e item "Usuários" foram acrescentados ao painel.

## [2026-10-09] update | Fase 6 concluída (T21–T22): testes e revisão de segurança
- Pedido: executar o plano de produção como orquestrador.
- O que foi feito: T21 (31 testes unitários a mais, smoke do Playwright com 11 casos e snapshots das quatro páginas protegidas, workflow de CI). T22 (cabeçalhos de segurança e CSP em `next.config.ts`, `noindex` e `no-store` nas rotas com dado pessoal, IP do cliente sem confiar no começo do `X-Forwarded-For`, limitadores de auth unificados, sobras de demonstração removidas, testes em `tests/security/`, página [[operacao/seguranca]]).
- Entregue: `npm run format:check`, `npm run typecheck`, `npm run lint` (0 erros, 2 avisos conhecidos), `npm test` (137), `npm run test:integration` (129), `npm run test:e2e` (11), `npm run build` e `npm audit --omit=dev --audit-level=high` verdes, rodados pelo orquestrador. Capturas novas comparadas com `revisao/baseline/`: só mudam os dados e o banner removido na T13.
- Armadilhas: a CSP sem `unsafe-eval` acusa o Zod 4 no navegador (resolvido com `jitless`). O `npm audit` de produção só passa com `overrides` → [[decisoes/013-override-do-deepmerge-ts]]. Snapshots do Playwright valem para Windows/Chromium → [[decisoes/012-snapshots-visuais-a-partir-do-estado-validado]]. O workflow de CI nunca rodou num runner. Cada execução do E2E e cada captura manual deixa pedidos fictícios no banco de dev.
- Pendências do dono: textos de demonstração do checkout que hoje são falsos ("Dados pessoais não são enviados nem salvos", disponibilidade "apenas neste navegador", "Pix · demonstração", "Total simulado"); se entrar CDN na frente do Caddy, configurar `trusted_proxies`; limpeza das regras CSS `.contribution*` órfãs.

## [2026-10-09] update | Plano de produção concluído (T00–T23): documentação final
- Pedido: executar a T23 (documentação final) como subagente, sem alterar código, testes, schema, plano, decisões ou registro; sem instalar dependências, sem Docker, sem servidores e sem commits.
- O que foi feito: `README.md` reescrito para o estado atual (T00–T23 concluídas, T24 pendente, Mercado Pago sem teste com credenciais reais). `README_PARA_ABNER.md` reescrito em linguagem simples para o dono (primeiro acesso, convites, pedidos, estorno, CSV, data e geração do sorteio, Pix que não confirma, backup pendente, senhas). Nota de superação no topo de `CODEX_INSTRUCTIONS.md`. `wiki/arquitetura/stack.md` com coluna "Hoje (após T23)" e versões atuais. `wiki/arquitetura/estrutura-de-pastas.md` substituído pela árvore real. `wiki/operacao/como-executar.md` corrigido: comandos conferidos com o `package.json`, `db:migrate` no lugar de `prisma migrate dev`, sem `start` nem `expire`. `wiki/index.md` com a intro atualizada e `[[plano/status]]` incluído.
- Entregue: arquivos listados acima. Nenhum comando de instalação, Docker ou servidor foi executado nesta tarefa; os comandos da documentação não foram rodados de ponta a ponta.
- Armadilhas: `Dockerfile` (imagem de execução) não copia `scripts/` nem instala `tsx`, então `db:seed` e `admin:create` dentro do contêiner, descritos em `deploy.md`, não funcionam como estão. Isso fica para a T24. A T23 pede conferir comandos rodando de verdade, mas a instrução desta tarefa proibiu instalar dependências e subir Docker; por isso a conferência foi feita contra os arquivos. `wiki/operacao/variaveis-de-ambiente.md` ainda tem um exemplo de e-mail de provedor comum no `MAIL_FROM`; não foi alterado nesta tarefa, por estar fora da lista permitida.

## [2026-10-09] update | T24 preparada: imagem Docker corrigida e Caminho A ensaiado localmente
- Pedido: executar o plano de produção como orquestrador.
- O que foi feito: a imagem Docker foi construída do zero pela primeira vez e corrigida (schema antes do `npm ci`, domínio como build arg, build sem banco, estágio e serviço `tools` para migração, seed e `admin:create`). `/`, `/contribuir` e as páginas legais passaram a ser renderizadas a cada visita. [[operacao/deploy]] ganhou o Caminho A com a lista exata de comandos, o modelo de `.env` de produção sem valores, crons de expiração e backup, atualização e reversão. [[operacao/checklist-producao]] ganhou a seção do que foi ensaiado localmente.
- Entregue: ensaio em Docker local com variáveis fictícias, num projeto isolado removido ao final: build com banco vazio, migração, seed, admin criado, login, cabeçalhos, processo sem root, `caddy validate`, `pg_dump` e restauração. Depois das mudanças, rodados pelo orquestrador: `format:check`, `typecheck`, `lint`, `npm test` (137), `test:integration` (129), `test:e2e` (11, snapshots sem alteração) e `build`.
- Armadilhas: o plano parou no passo 1 da T24, que é do dono (VPS, DNS, Docker). Nada foi verificado em servidor real: HTTPS com domínio, Mercado Pago, SMTP real. `cp .env.example .env` não serve em produção: o exemplo é de demonstração e o app se recusa a subir com ele. `POSTGRES_PASSWORD` precisa ser definida antes do primeiro `up`. O repositório não tem remoto git. → [[decisoes/014-build-sem-banco-e-imagem-de-ferramentas]].
- Pendências do dono: descrição "demonstração sem cobrança ou sorteio real" que o `prisma/seed.ts` grava num produto (corrigir antes do seed em produção); destino do backup fora do servidor; confirmar a meta de R$ 2.500; textos de demonstração das páginas públicas.
