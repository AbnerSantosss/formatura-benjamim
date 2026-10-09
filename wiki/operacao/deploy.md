---
tipo: operacao
atualizado: 2026-10-09
tags: [deploy, docker, vps, caddy, vercel]
---

# Deploy

## Caminho A (recomendado): VPS com Docker Compose

Estado em 2026-10-09: tudo abaixo foi ensaiado em Docker local (imagem construída do zero com o banco vazio, migração, seed, admin, login, backup e restauração). **Ainda não foi executado em uma VPS.** O que ficou sem verificação está no fim desta seção.

### O que roda
- `Dockerfile`: gera duas imagens. `runner` é o app (saída `standalone` do Next, usuário `app`, sem privilégios). `tools` tem o `node_modules` completo, `prisma/`, `scripts/` e `src/`; serve para migração, seed e `admin:create` e só existe enquanto o comando roda.
- `docker-compose.yml`: `db` (Postgres 16, volume `pgdata`), `app` (só `expose`, nunca publica porta), `caddy` (portas 80 e 443, HTTPS automático para `SITE_DOMAIN`) e `tools` (perfil `tools`; não sobe com `up`). O perfil `dev` (mailpit) não é usado em produção.
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

### Tarefas agendadas (`crontab -e` do usuário de deploy)
Expiração de pedidos vencidos, a cada 5 minutos. É opcional (a expiração preguiçosa já libera os números quando alguém consulta), mas mantém a grade em dia:
```cron
*/5 * * * * curl -fsS -m 20 -o /dev/null -X POST -H "Authorization: Bearer $(grep '^CRON_SECRET=' $HOME/benjamim/.env | cut -d= -f2-)" https://<dominio>/api/internal/expirar
```
Teste à mão: o mesmo comando sem `-o /dev/null` responde `{"expired":0}`. Sem o cabeçalho, responde 401.

Backup diário. Criar `~/backup-benjamim.sh` e dar `chmod 700`:
```sh
#!/bin/sh
# Dump diário do banco. O arquivo tem dados pessoais (nome, e-mail, telefone; CPF cifrado): acesso só do dono.
set -eu
umask 077
cd "$HOME/benjamim"
mkdir -p "$HOME/backups"
destino="$HOME/backups/benjamim-$(date +%F).sql.gz"
docker compose exec -T db pg_dump -U benjamim benjamim > "$destino.tmp"
gzip -c "$destino.tmp" > "$destino"
rm -f "$destino.tmp"
find "$HOME/backups" -name 'benjamim-*.sql.gz' -mtime +30 -delete
```
```cron
15 3 * * * $HOME/backup-benjamim.sh >> $HOME/backups/backup.log 2>&1
```
Teste de restauração em banco vazio (não toca no banco em uso):
```bash
cd ~/benjamim
docker compose exec -T db createdb -U benjamim restauracao_teste
gunzip -c ~/backups/benjamim-AAAA-MM-DD.sql.gz | docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U benjamim -d restauracao_teste
docker compose exec -T db psql -U benjamim -d restauracao_teste -c 'select count(*) from "Campaign"'
docker compose exec -T db dropdb -U benjamim restauracao_teste
```
O backup só protege de verdade se sair do servidor. Para onde copiar (e com que proteção) é decisão do dono, porque o arquivo tem dados pessoais. A chave `CPF_ENCRYPTION_KEY` não está no dump: sem ela os CPFs restaurados não podem ser lidos.

### Atualizar
```bash
cd ~/benjamim
~/backup-benjamim.sh
git pull
docker compose --profile tools build
docker compose run --rm tools npx prisma migrate deploy
docker compose up -d
```
O backup vem sempre antes. Nunca usar `prisma migrate dev` no servidor.

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
- comando do cron de expiração (`{"expired":0}`), `pg_dump` e restauração em banco vazio.

Não verificado: VPS Linux real, memória durante o build em 2 GB, certificado público do Caddy com o domínio, Mercado Pago (cobrança, webhook, estorno), SMTP real (alguns provedores de VPS bloqueiam a porta 587 de saída), cron no servidor, o script de backup como arquivo (os comandos dele foram rodados um a um).

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
- Não há `cloudflared` na stack. O app publica só `127.0.0.1:3470` no servidor (`APP_PORT` troca a porta), e o túnel `servidor-abner`, que já roda no servidor, tem a rota `benjamim.proxserverabner.site` → `http://localhost:3470`.

### Variáveis
O repositório é público: nenhum valor fica nele. As variáveis ficam na própria stack do Portainer (Environment variables). As mesmas do Caminho A, com duas diferenças: `SITE_DOMAIN` não existe, e `NODE_ENV` e `DEMO_MODE` são fixos no compose. Nenhum token de túnel é necessário.
O arquivo local `.env.portainer` (ignorado pelo git) guarda uma cópia do que foi carregado; na criação da stack, use "Load variables from .env file".

### Atualizar
`git push origin main` e, no Portainer, stack `benjamim` > "Pull and redeploy". Se `NEXT_PUBLIC_SITE_URL` mudar, a imagem precisa ser reconstruída.

### Cuidados
- `POSTGRES_PASSWORD` não muda depois do primeiro deploy (o volume guarda a antiga).
- Depois do primeiro login do administrador, apague `ADMIN_BOOTSTRAP_PASSWORD` das variáveis da stack.
- Webhook do Mercado Pago: `https://benjamim.proxserverabner.site/api/webhooks/mercadopago`.
- Chaves do gateway: entram pelo painel (Configurações → Gateways de pagamento), só pelo proprietário. `MP_*`, `FASTPAY_*` e `IRONPAY_*` na stack são opcionais; o que for salvo no painel vale no lugar delas.
- Expiração de reservas e backup (seção "Tarefas agendadas" do Caminho A) ainda precisam de um agendador no servidor.
