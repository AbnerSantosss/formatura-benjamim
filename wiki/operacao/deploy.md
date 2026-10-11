---
tipo: operacao
atualizado: 2026-10-11
tags: [deploy, docker, vps, caddy, vercel]
---

# Deploy

## Caminho A (recomendado): VPS com Docker Compose

Estado em 2026-10-09: tudo abaixo foi ensaiado em Docker local (imagem construída do zero com o banco vazio, migração, seed, admin, login, backup e restauração). **Ainda não foi executado em uma VPS.** O que ficou sem verificação está no fim desta seção.

### O que roda
- `Dockerfile`: gera duas imagens. `runner` é o app (saída `standalone` do Next, usuário `app`, sem privilégios). `tools` tem o `node_modules` completo, `prisma/`, `scripts/` e `src/`; serve para migração, seed e `admin:create` e só existe enquanto o comando roda.
- `docker-compose.yml`: `db` (Postgres 16, volume `pgdata`), `app` (só `expose`, nunca publica porta), `caddy` (portas 80 e 443, HTTPS automático para `SITE_DOMAIN`) e `tools` (perfil `tools`; não sobe com `up`). O perfil `dev` (mailpit) não é usado em produção.
- Dois serviços de rotina sobem junto com o resto, sem cron no servidor: `expirar` (varredura de reservas vencidas a cada minuto) e `backup` (dump diário do banco no volume `backups`). Detalhes em "Rotinas automáticas".
- O build da imagem **não usa banco nem segredos**. Ele só precisa de `NEXT_PUBLIC_SITE_URL`, que o compose lê do `.env` e repassa como build arg. Se o domínio mudar, é preciso reconstruir a imagem.
- A imagem do app não tem `tsx` nem a CLI do Prisma. Por isso os comandos de operação são `docker compose run --rm tools ...`, e não `docker compose exec app ...`.

### Antes de começar (passo humano)
- VPS Ubuntu 22.04 ou mais novo, 2 GB de RAM, com Docker Engine e o plugin Compose. Usuário sem ser root, no grupo `docker`.
- Registro A do domínio apontando para o IP da VPS **antes** de subir o Caddy. Sem isso o certificado não sai.
- Portas 80 e 443 liberadas no firewall do provedor e do servidor. A 22 só para SSH.
- Com 2 GB de RAM, criar 2 GB de swap antes do primeiro build (o `next build` é o passo mais pesado):
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- O repositório hoje não tem remoto. Duas formas de levar o código (branch `producao`) para o servidor:
  1. repositório **privado** no GitHub e `git clone` no servidor com uma chave de deploy só de leitura (recomendado: atualizar vira `git pull`);
  2. sem conta nenhuma: no PC, `git bundle create benjamim.bundle producao`, copiar o arquivo com `scp` e, no servidor, `git clone -b producao benjamim.bundle benjamim`. Para atualizar, gerar e copiar o bundle de novo para o mesmo lugar e rodar `git pull` na pasta.

### 1. Código e `.env`
```bash
# no servidor, com o usuário de deploy
git clone -b producao <url-do-repositorio> ~/benjamim
cd ~/benjamim
nano .env          # colar o modelo abaixo e preencher
chmod 600 .env
```
Não use `cp .env.example .env`: o exemplo é de desenvolvimento (`PAYMENT_GATEWAY=demo`, `DEMO_MODE=true`) e o app se recusa a subir em produção com ele. Crie o arquivo no próprio servidor, não no Windows (fim de linha CRLF estraga os valores).

Modelo do `.env` de produção. As linhas com valor já preenchido são configuração fixa, não segredo. O resto fica em branco aqui e só é preenchido no servidor. Os comentários ficam sempre na linha de cima, nunca na mesma linha do valor.
```bash
# ---------- Site ----------
NODE_ENV=production
# https://<dominio>, sem barra no fim. Entra no build da imagem: se mudar, reconstrua.
NEXT_PUBLIC_SITE_URL=
# <dominio> puro, sem https://. É o que o Caddy usa para pedir o certificado.
SITE_DOMAIN=

# ---------- Banco ----------
# Gerar com: openssl rand -hex 24
# Definir ANTES do primeiro "up". Depois disso o volume guarda a senha antiga e trocar aqui quebra a conexão.
# Não definir DATABASE_URL: o docker-compose.yml monta a URL a partir desta senha.
POSTGRES_PASSWORD=

# ---------- Segredos do app (um comando por variável, três valores diferentes) ----------
# openssl rand -hex 32
AUTH_SECRET=
# openssl rand -hex 32. Guardar também no gerenciador de senhas: perder esta chave = perder os CPFs.
CPF_ENCRYPTION_KEY=
# openssl rand -hex 32. Protege POST /api/internal/expirar.
CRON_SECRET=

# ---------- Pagamento: Mercado Pago, credenciais de PRODUÇÃO ----------
PAYMENT_GATEWAY=mercadopago
MP_ENVIRONMENT=production
MP_API_FLAVOR=orders
# Painel do Mercado Pago > Suas integrações > aplicação > Credenciais de produção > Access Token
MP_ACCESS_TOKEN=
# Mesma tela (Public Key). Não é usada no Pix; fica por completude.
MP_PUBLIC_KEY=
# Suas integrações > Webhooks > assinatura secreta (passo 4). O app não sobe sem ela.
MP_WEBHOOK_SECRET=

# ---------- E-mail: conta Gmail dedicada da campanha ----------
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
# Endereço da conta Gmail da campanha
SMTP_USER=
# Senha de app de 16 letras (Conta Google > Segurança > Senhas de app), sem espaços. Não é a senha da conta.
SMTP_PASS=
# Formato: "BENJAMIM ABC <mesmo endereço do SMTP_USER>", com as aspas duplas
MAIL_FROM=
# Opcional: endereço que recebe as respostas
MAIL_REPLY_TO=

# ---------- Só para o seed (depois vive no banco e muda pelo painel) ----------
# Meta e custos em centavos (250000 = R$ 2.500,00). Valor decidido pelo dono.
CAMPAIGN_GOAL_CENTS=250000
CAMPAIGN_COSTS_CENTS=0
# Opcionais: links do rodapé
INSTAGRAM_FATHER_URL=
INSTAGRAM_MOTHER_URL=
LOG_LEVEL=info

# ---------- Primeiro administrador (usado só por admin:create) ----------
# Ex.: voce@exemplo.com
ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_NAME=
# Senha temporária NOVA, 10+ caracteres com letra e número. Apagar esta linha depois do passo 3.
ADMIN_BOOTSTRAP_PASSWORD=
```
Cuidados com o arquivo:
- `DEMO_MODE` não aparece. `PAYMENT_GATEWAY=demo` e `DEMO_MODE=true` impedem o app de subir em produção.
- O Pix simulado em produção é controlado pelo painel (Configurações → Modo demonstração, ligado por padrão), não por variável: ver [[decisoes/016-modo-demonstracao-no-painel]]. Desligue antes de divulgar a campanha.
- O compose interpreta `$` dentro dos valores. Se algum valor tiver `$`, escreva entre aspas simples.
- `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` não são mais obrigatórias para o app subir: podem ficar em branco aqui e ser salvas depois no painel (Configurações → Gateways de pagamento, [[decisoes/015-credenciais-de-gateway-no-painel]]). Enquanto faltarem nos dois lugares, o site abre e o Pix não é gerado.

### 2. Construir, preparar o banco e subir
```bash
cd ~/benjamim
docker compose --profile tools build
docker compose up -d db
docker compose run --rm tools npx prisma migrate deploy
docker compose run --rm tools npm run db:seed
docker compose run --rm tools npm run admin:create
docker compose up -d
docker compose ps
curl -sI https://<dominio>/ | grep -i strict-transport-security
```
Linha a linha: constrói as imagens do app e das ferramentas (alguns minutos); sobe só o banco; cria as tabelas; grava a campanha e os dois produtos (idempotente); cria o primeiro admin a partir de `ADMIN_BOOTSTRAP_*`; sobe o app e o Caddy; confere.
- Saídas esperadas: `All migrations have been successfully applied.`, `Seed concluído: campanha "main" (1 no banco), 2 produtos no banco.`, `Administrador OWNER v***@... criado. A senha do .env é temporária: será trocada no primeiro login.`
- `docker compose up -d --build` logo de início também funciona: o app sobe e responde erro 500 nas páginas até a migração e o seed rodarem; depois passa a responder sem reiniciar.
- `admin:create` aceita `-- --email voce@exemplo.com --name "Seu Nome"` no lugar das variáveis de e-mail e nome. Sem `ADMIN_BOOTSTRAP_PASSWORD` no `.env`, ele pergunta a senha no terminal (sem eco) e essa senha já é a definitiva.
- O primeiro certificado leva de alguns segundos a um minuto. Acompanhe com `docker compose logs -f caddy`.

### 3. Primeiro acesso
1. Abrir `https://<dominio>/admin`, entrar com o e-mail e a senha temporária e trocar a senha (o painel obriga).
2. Apagar a linha `ADMIN_BOOTSTRAP_PASSWORD` do `.env` e aplicar: `docker compose up -d`.
3. Opcional, e-mail de teste: `docker compose run --rm tools npm run email:test -- --to voce@exemplo.com`.

### 4. Webhook do Mercado Pago
1. No painel do Mercado Pago, cadastrar `https://<dominio>/api/webhooks/mercadopago`. Eventos e detalhes em [[integracoes/mercado-pago]].
2. Copiar a assinatura secreta para `MP_WEBHOOK_SECRET` no `.env`.
3. Aplicar com `docker compose up -d`.

**Mudou o `.env`? Use `docker compose up -d`.** O `docker compose restart app` reinicia o contêiner com as variáveis antigas. Se o que mudou foi `NEXT_PUBLIC_SITE_URL`, use `docker compose up -d --build`.

### Rotinas automáticas (serviços `expirar` e `backup`)
As duas rotinas rodam dentro do próprio compose. Não há `crontab` nem script no servidor: `docker compose up -d` basta. Nenhuma variável nova: usam `CRON_SECRET` e `POSTGRES_PASSWORD`, que já existem.

**`expirar`** (imagem `curlimages/curl:8.22.0`). A cada 60 segundos faz `POST http://app:3000/api/internal/expirar` pela rede interna, com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. A rota expira os pedidos pendentes vencidos e libera os números deles; responde `{"expired":N}`.
- A expiração preguiçosa continua valendo: um pendente vencido já não conta como número ocupado em nenhuma leitura. A varredura grava isso no banco, para o pedido aparecer como expirado sem depender de alguém consultar.
- O segredo chega ao `curl` pela entrada padrão, não pela linha de comando, e não aparece no log.
- O log só ganha linha quando o estado muda: `expirar: ok, varredura a cada 60s`, `expirar: falha HTTP <código>` (`000` = app fora do ar ou reiniciando; `401` = `CRON_SECRET` diferente do app) ou `expirar: {"expired":N}` quando algum pedido expirou. Falha não derruba o laço.
- Com `CRON_SECRET` vazio o serviço avisa uma vez no log e fica parado, e a rota responde 401 para qualquer um. Preencha a variável e rode `docker compose up -d`.

**`backup`** (imagem `postgres:16-alpine`, a mesma do `db`). Faz um `pg_dump` em formato custom assim que sobe e depois todo dia às 03:15 UTC (00:15 em Brasília).
- Arquivo: `/backups/benjamim-AAAA-MM-DD.dump` (data UTC), no volume `backups`. Um arquivo por dia: um segundo backup no mesmo dia substitui o primeiro.
- Escrita atômica: grava em `.tmp`, confere com `pg_restore --list` e só então renomeia. Se falhar, o arquivo anterior fica intacto e há nova tentativa em 10 minutos.
- Guarda os 14 arquivos mais recentes e apaga os mais antigos, só depois de um backup que deu certo. Horário e quantidade ficam em `BACKUP_HORA_UTC` e `BACKUP_MANTER`, no próprio compose.
- O arquivo tem dados pessoais (nome, e-mail, telefone; CPF cifrado). A chave `CPF_ENCRYPTION_KEY` não está no dump: sem ela os CPFs restaurados não podem ser lidos.

Ver se estão rodando:
```bash
cd ~/benjamim
docker compose ps expirar backup
docker compose logs --tail 20 expirar backup
docker compose exec backup ls -lh /backups
```
Backup na hora (antes de atualizar, por exemplo): `docker compose restart backup` e conferir a linha `backup: benjamim-AAAA-MM-DD.dump gravado (...)` no log.

Teste de restauração em banco vazio (não toca no banco em uso):
```bash
docker compose exec backup sh -c 'createdb restauracao_teste && pg_restore --no-owner -d restauracao_teste /backups/benjamim-AAAA-MM-DD.dump && psql -d restauracao_teste -c "select count(*) from \"Campaign\""; dropdb restauracao_teste'
```
Restauração de verdade, por cima do banco em uso. **Apaga tudo o que entrou depois do backup**; avise o dono antes:
```bash
docker compose stop app expirar
docker compose exec backup pg_restore --clean --if-exists --no-owner -d benjamim /backups/benjamim-AAAA-MM-DD.dump
docker compose start app expirar
```

**Limite do backup: ele fica no mesmo servidor do banco.** Protege contra erro humano, migração ruim e dado apagado. Não protege contra perda do servidor, do disco ou do volume (`docker compose down -v` apaga o banco e os backups juntos). Enquanto nenhuma cópia sair do servidor, perder o servidor é perder a campanha inteira.
Para copiar para fora: no servidor, `docker compose cp backup:/backups/benjamim-AAAA-MM-DD.dump ~/`; no seu computador, `scp usuario@servidor:benjamim-AAAA-MM-DD.dump .`. Para onde copiar e com que frequência é decisão do dono, porque o arquivo tem dados pessoais.

### Atualizar
```bash
cd ~/benjamim
docker compose restart backup && sleep 15 && docker compose logs --tail 1 backup
git pull
docker compose --profile tools build
docker compose run --rm tools npx prisma migrate deploy
docker compose up -d
```
O backup vem sempre antes: só siga se a última linha do log for `backup: ... gravado`. Nunca usar `prisma migrate dev` no servidor.

### Reverter
```bash
cd ~/benjamim
git log --oneline -5
git checkout <commit-anterior>
docker compose --profile tools build
docker compose up -d
```
- Para voltar ao normal depois: `git checkout producao` e os passos de "Atualizar".
- Migração não volta sozinha. Se a atualização aplicou uma migração e o código antigo não funciona com o banco novo, a saída é restaurar o backup feito antes de atualizar, o que perde os pedidos criados depois dele. Avise o dono antes de fazer isso.
- `docker compose down` para tudo e mantém os dados. **`docker compose down -v` apaga o banco.**

### Logs e diagnóstico
- `docker compose logs -f app` (sem dado pessoal nos logs), `docker compose logs -f caddy`, `docker compose ps`.
- App reiniciando em laço com `Variáveis de ambiente inválidas`: o log lista o nome de cada variável com problema, nunca o valor.
- Erro 500 com `The table public.Campaign does not exist`: falta `migrate deploy`.
- Login recusado com 403: `NEXT_PUBLIC_SITE_URL` no `.env` diferente do endereço usado no navegador (com ou sem `www`, http no lugar de https).
- O Postgres fica acessível só em `127.0.0.1:5442` do próprio servidor. Não abrir essa porta no firewall.

### Verificado localmente e ainda não verificado
Ensaio de 2026-10-09 em Docker Desktop (Windows), projeto isolado, com um `.env` fictício:
- imagem construída do zero com o banco vazio e sem segredos; as três páginas que leem o banco (`/`, `/contribuir` e as páginas legais) passaram a ser renderizadas a cada visita (`dynamic = 'force-dynamic'`), porque o build não tem banco;
- `migrate deploy`, `db:seed`, `admin:create` e `email:test` (até a tentativa de conexão SMTP) pelos comandos acima;
- `/` 200 com `Strict-Transport-Security` e CSP sem `unsafe-eval`; `/api/demo/aprovar` 404; `/admin` 200; login do admin criado, com troca de senha obrigatória; `/api/admin/*` sem cookie 401;
- processo do app como usuário `app` (uid 100), não root; `Caddyfile` válido e proxy do Caddy respondendo por HTTPS com certificado interno;
- chamada de expiração (`{"expired":0}`), `pg_dump` e restauração em banco vazio.

Não verificado: VPS Linux real, memória durante o build em 2 GB, certificado público do Caddy com o domínio, Mercado Pago (cobrança, webhook, estorno), SMTP real (alguns provedores de VPS bloqueiam a porta 587 de saída).

Ensaio de 2026-10-11 dos serviços `expirar` e `backup` (Docker Desktop, projeto isolado `benjamim-ensaio-ops`, senha fictícia, removido ao final), com as definições do `docker-compose.portainer.yml`:
- `backup`: primeiro dump ao subir; `pg_restore --list` lê o arquivo (formato custom, Postgres 16.15); restauração em banco vazio com 5.000 linhas conferidas; com 20 arquivos antigos no volume, sobraram os 14 mais recentes; `.tmp` órfão removido; com o banco parado, registra `FALHOU`, mantém os arquivos e segue no ar; arquivo com permissão 600; próximo horário calculado para 03:15 UTC.
- `expirar`: contra o servidor de desenvolvimento, respondeu `ok` com o segredo certo e uma única linha de log para cada caso de falha (401 com segredo errado, 000 com o app inacessível, aviso com segredo vazio); o segredo não aparece no log nem na lista de processos.

Não verificado nos serviços novos: a troca de dia (o segundo backup, às 03:15 UTC), a restauração por cima do banco em uso (`--clean`), a cópia para fora do servidor e os dois serviços dentro da stack real do Portainer.

## Caminho B: Vercel + Neon
- Projeto Vercel apontando para o repo; `DATABASE_URL` do Neon (pooled) + `DIRECT_URL` para migrações.
- `npx prisma migrate deploy` roda no build (`vercel-build`) ou localmente apontando para o Neon.
- Webhook do Mercado Pago aponta para `https://<app>.vercel.app/api/webhooks/mercadopago`.
- Limitação: rate limit em memória não funciona entre instâncias; trocar por tabela `RateLimit` (tarefa curta).

## Checklist de ida ao ar
Ver [[operacao/checklist-producao]].

## Caminho B (em uso): Portainer + túnel Cloudflare

Usado quando o servidor já tem Portainer e os sites saem por túnel Cloudflare. Não usa o Caddy nem publica porta no host.

### O que roda
Stack `benjamim` criada a partir do repositório público `https://github.com/AbnerSantosss/formatura-benjamim`, ref `refs/heads/main`, arquivo `docker-compose.portainer.yml`:
- `db`: Postgres 16, sem porta publicada.
- `migrate`: roda uma vez a cada deploy e termina (migrações, seed e, se houver `ADMIN_BOOTSTRAP_PASSWORD`, `admin:create`). Tudo idempotente.
- `app`: a imagem `runner`. Só sobe depois que `migrate` termina sem erro.
- `expirar`: chama `POST /api/internal/expirar` a cada minuto pela rede interna (`http://app:3000`), com o `CRON_SECRET` da stack. Imagem pública `curlimages/curl:8.22.0`; não passa pelo túnel.
- `backup`: `pg_dump` ao subir e todo dia às 03:15 UTC, no volume `benjamim_backups`. Imagem `postgres:16-alpine`, a mesma do `db`. Guarda 14 dias.
- Não há `cloudflared` na stack. O app publica só `127.0.0.1:3470` no servidor (`APP_PORT` troca a porta), e o túnel `servidor-abner`, que já roda no servidor, tem a rota `benjamim.proxserverabner.site` → `http://localhost:3470`.

### Variáveis
O repositório é público: nenhum valor fica nele. As variáveis ficam na própria stack do Portainer (Environment variables). As mesmas do Caminho A, com duas diferenças: `SITE_DOMAIN` não existe, e `NODE_ENV` e `DEMO_MODE` são fixos no compose. Nenhum token de túnel é necessário.
O arquivo local `.env.portainer` (ignorado pelo git) guarda uma cópia do que foi carregado; na criação da stack, use "Load variables from .env file".

### Atualizar
`git push origin main` e, no Portainer, stack `benjamim` > "Pull and redeploy" > "Update" (sem marcar "Re-pull image"). Se `NEXT_PUBLIC_SITE_URL` mudar, a imagem precisa ser reconstruída.

O que esperar (medido em dois redeploys em 2026-10-09):

- O build leva cerca de 8 minutos. O site antigo continua respondendo nesse tempo; na troca há uns 30 segundos de 502.
- O contêiner `migrate` aplica as migrações e o seed a cada deploy.
- Para saber se a versão nova entrou, peça uma rota que só exista nela (por exemplo `curl -s -o /dev/null -w "%{http_code}" https://benjamim.proxserverabner.site/pagamento/indisponivel`) ou procure no CSS servido algo que mudou.
- A sessão do Portainer expira; o login é sempre feito pelo dono.

### Cuidados
- `POSTGRES_PASSWORD` não muda depois do primeiro deploy (o volume guarda a antiga).
- Depois do primeiro login do administrador, apague `ADMIN_BOOTSTRAP_PASSWORD` das variáveis da stack.
- Webhook do Mercado Pago: `https://benjamim.proxserverabner.site/api/webhooks/mercadopago`.
- Chaves do gateway: entram pelo painel (Configurações → Gateways de pagamento), só pelo proprietário. `MP_*`, `FASTPAY_*` e `IRONPAY_*` na stack são opcionais; o que for salvo no painel vale no lugar delas.
- `CRON_SECRET` precisa estar preenchido nas variáveis da stack. Vazio, o serviço `expirar` fica parado (avisa no log) e sobra só a expiração preguiçosa.

### Rotinas automáticas
Expiração de reservas e backup rodam na própria stack: "Pull and redeploy" basta, sem cron no servidor e sem variável nova. O funcionamento de cada serviço está em "Rotinas automáticas" do Caminho A; aqui ficam só os comandos desta instalação.

Ver se estão rodando: no Portainer, stack `benjamim` > contêineres `benjamim-expirar-1` e `benjamim-backup-1` com estado `running`, e o ícone de log de cada um. O esperado é `expirar: ok, varredura a cada 60s` e `backup: benjamim-AAAA-MM-DD.dump gravado (...), N arquivo(s) no volume`. Pelo terminal do servidor:
```bash
docker logs --tail 20 benjamim-expirar-1
docker logs --tail 20 benjamim-backup-1
docker exec benjamim-backup-1 ls -lh /backups
```
- Cada redeploy pode recriar o contêiner `backup` e gerar um backup novo do dia, mas ele roda ao mesmo tempo que o `migrate`: não conta como "backup antes da migração". Antes de um deploy que traga migração, reinicie o contêiner `backup` no Portainer (botão Restart) e confira a linha `gravado` no log.
- Teste de restauração em banco vazio (pelo terminal do servidor):
  ```bash
  docker exec benjamim-backup-1 sh -c 'createdb restauracao_teste && pg_restore --no-owner -d restauracao_teste /backups/benjamim-AAAA-MM-DD.dump && psql -d restauracao_teste -c "select count(*) from \"Campaign\""; dropdb restauracao_teste'
  ```
- Restauração de verdade (**apaga o que entrou depois do backup**): parar `benjamim-app-1` e `benjamim-expirar-1` no Portainer, rodar `docker exec benjamim-backup-1 pg_restore --clean --if-exists --no-owner -d benjamim /backups/benjamim-AAAA-MM-DD.dump` e iniciar os dois de novo.
- **O backup fica no mesmo servidor.** Se o servidor, o disco ou o volume `benjamim_backups` se perderem, o banco e os backups vão juntos. Remover a stack apagando os volumes também leva os dois. Para ter cópia fora: no servidor, `docker cp benjamim-backup-1:/backups/benjamim-AAAA-MM-DD.dump ~/`; no computador, `scp usuario@servidor:benjamim-AAAA-MM-DD.dump .`. Hoje ninguém faz essa cópia: é passo manual do dono.
