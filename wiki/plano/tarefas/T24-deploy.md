---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-7, deploy, producao, humano]
---

# T24 — Deploy em produção (VPS) e ativação do Mercado Pago

- **Modelo:** opus (prepara e conduz) + **humano** (credenciais, DNS, pagamento real).
- **Depende de:** T23.
- **Arquivos:** nenhum no repositório além de `wiki/log.md` e `wiki/operacao/deploy.md` (ajustes do que foi aprendido).
- **Ler antes:** [[operacao/deploy]], [[operacao/checklist-producao]], [[integracoes/mercado-pago]], [[operacao/variaveis-de-ambiente]].

## Passos (marcar `[H]` = humano, `[A]` = agente)
1. `[H]` Contratar VPS (2 GB RAM, Ubuntu 22.04+), apontar o domínio (registro A) para o IP, instalar Docker e Compose. Criar usuário não-root com acesso ao Docker.
2. `[A]` Entregar ao humano a lista exata de comandos de [[operacao/deploy]] "Caminho A" e o `.env` de produção **como template** (sem valores), com instruções de `openssl rand -hex 32` para `AUTH_SECRET`, `CPF_ENCRYPTION_KEY` e `CRON_SECRET`.
3. `[H]` Preencher o `.env` no servidor: `NODE_ENV=production`, `NEXT_PUBLIC_SITE_URL=https://<dominio>`, `PAYMENT_GATEWAY=mercadopago`, credenciais de produção do MP, SMTP (Gmail BENJAMIM ABC: `smtp.gmail.com`, 587, usuário e senha de app), `MAIL_FROM="BENJAMIM ABC <conta@gmail.com>"`, `SITE_DOMAIN=<dominio>` (para o Caddy), `ADMIN_BOOTSTRAP_*` com uma senha temporária **nova** (não reutilizar a de dev). `DEMO_MODE` ausente.
4. `[H]` `docker compose up -d --build`, `docker compose exec app npx prisma migrate deploy`, `db:seed`, `admin:create`. Entrar no painel e trocar a senha temporária. Depois apagar `ADMIN_BOOTSTRAP_PASSWORD` do `.env` do servidor.
5. `[H]` No painel do Mercado Pago: cadastrar webhook `https://<dominio>/api/webhooks/mercadopago` (eventos Pagamentos e Orders), copiar a assinatura secreta para `MP_WEBHOOK_SECRET`, `docker compose restart app`.
6. `[A]` Conduzir o teste ponta a ponta com o humano: pedido de R$ 5 real → pagar → ver aprovação em até 1 min → e-mail de confirmação chegou → número aparece como vendido → estornar pelo painel → número liberado. Registrar horários e ids (sem dados pessoais) no relatório.
7. `[H]` Convidar o segundo admin pelo painel e confirmar que o e-mail chegou e o convite funciona.
8. `[A]` Configurar no painel: meta, data do sorteio, Instagram, mensagem pública. Ativar `drawPublic` só quando o humano quiser.
9. `[H]` Backup: criar o cron de `pg_dump` conforme a wiki e testar uma restauração em banco vazio.
10. `[A]` Percorrer [[operacao/checklist-producao]] inteiro marcando cada item com evidência; o que não passar vira pendência listada.
11. `[A]` Atualizar `wiki/log.md` com `## [AAAA-MM-DD] update | Go-live` e ajustar `wiki/operacao/deploy.md` com qualquer diferença encontrada.

## Critério de aceite
- `curl -sI https://<dominio>/ | grep -i strict-transport-security` responde.
- Pagamento real aprovado via webhook e estornado com sucesso.
- Checklist de produção sem itens abertos, ou pendências listadas no relatório final.

## Não fazer
- Não colar credenciais em chat, wiki, commits ou relatório.
- Não rodar `prisma migrate dev` em produção (só `migrate deploy`).
- Não deixar `DEMO_MODE=true` ou `PAYMENT_GATEWAY=demo` no servidor.

## Desvios registrados
- 2026-10-09: só a preparação foi feita (passo 2 e o ensaio local do passo 4). O passo 1 é do dono e não aconteceu; os passos 3 a 11 seguem pendentes.
- Além de `wiki/log.md` e `wiki/operacao/deploy.md`, mudaram `Dockerfile`, `docker-compose.yml`, `.dockerignore`, três `page.tsx` (uma linha de cache em cada), `checklist-producao.md` e `README.md`: a imagem não construía nem rodava os comandos do passo 4 → [[decisoes/014-build-sem-banco-e-imagem-de-ferramentas]].
- Os comandos do passo 4 mudaram: `docker compose --profile tools build`, `docker compose up -d db`, `docker compose run --rm tools npx prisma migrate deploy`, `... npm run db:seed`, `... npm run admin:create`, `docker compose up -d`. Vale o que está em [[operacao/deploy]], Caminho A.
- `MP_WEBHOOK_SECRET` é obrigatória para o app subir: o webhook do passo 5 precisa ser cadastrado antes do passo 4, ou o app sobe com valor provisório e é reiniciado depois.
- O cron de expiração lê `CRON_SECRET` do `.env` do servidor (a variável não existe no ambiente do cron).
