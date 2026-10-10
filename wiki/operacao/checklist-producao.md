---
tipo: operacao
atualizado: 2026-10-10
tags: [checklist, producao, go-live]
---

# Checklist de produção

Os itens abaixo só são marcados com evidência **em produção** (domínio real, HTTPS público, credenciais reais). Em 2026-10-09 nenhum foi marcado: o deploy na VPS ainda não aconteceu.

## Ensaiado localmente (T24, 2026-10-09)
Feito em Docker local, com `.env` fictício e sem domínio. Não substitui os itens das seções seguintes.
- [x] Imagem construída do zero, com o banco vazio e sem segredos no build.
- [x] `migrate deploy`, `db:seed` e `admin:create` pelos comandos de [[operacao/deploy]] (`docker compose run --rm tools ...`).
- [x] App roda como usuário sem privilégios (`app`, uid 100); `app` não publica porta, só o Caddy.
- [x] `/` responde 200 com `strict-transport-security`, `x-content-type-options`, `x-frame-options` e CSP sem `unsafe-eval`; `/api/demo/aprovar` responde 404 (vale só com o modo demonstração desligado no painel; ligado, a rota existe: [[decisoes/016-modo-demonstracao-no-painel]]).
- [x] `/admin/pedidos` sem sessão redireciona para o login; `/api/admin/pedidos` sem cookie responde 401; login do admin criado funciona e exige troca de senha.
- [x] `Caddyfile` válido (`caddy validate`) e proxy respondendo por HTTPS com certificado interno.
- [x] `POST /api/internal/expirar` com `CRON_SECRET` responde `{"expired":0}`; sem o segredo, 401.
- [x] `pg_dump` e restauração em banco vazio com os comandos de [[operacao/deploy]].
- [x] `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` verdes depois das mudanças da T24 (`test:integration` e Playwright não foram rodados de novo).

## Antes do deploy
- [ ] `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build` verdes.
- [ ] `.env` de produção criado a partir do modelo de [[operacao/deploy]] (não do `.env.example`); `DEMO_MODE` ausente ou `false`; `PAYMENT_GATEWAY=mercadopago`; `NEXT_PUBLIC_SITE_URL` e `SITE_DOMAIN` com o domínio real.
- [ ] `POSTGRES_PASSWORD` definida antes do primeiro `docker compose up`.
- [ ] `AUTH_SECRET`, `CPF_ENCRYPTION_KEY` e `CRON_SECRET` gerados (`openssl rand -hex 32`) e guardados em cofre.
- [ ] `ADMIN_BOOTSTRAP_PASSWORD` apagada do `.env` depois do primeiro login.
- [ ] Textos legais (`/termos`, `/privacidade`, `/regulamento`) revisados pelo organizador, inclusive por redação de demonstração (não revisados até 2026-10-10) ([[decisoes/001-rifa-com-numeros-e-sorteio]]).
- [ ] Data do sorteio decidida (pode ser configurada depois no painel).

## Antes de divulgar (modo demonstração, 2026-10-10)

O site subiu com o modo demonstração ligado (Configurações → "Modo demonstração"). Enquanto estiver ligado nenhum Pix real é gerado, e qualquer visitante consegue aprovar o próprio pedido simulado. Na ordem:

- [ ] Primeiro acesso do dono em `/admin` (senha temporária, troca obrigatória) e `ADMIN_BOOTSTRAP_PASSWORD` apagada das variáveis da stack.
- [ ] Chaves do Mercado Pago salvas em Configurações → Gateways de pagamento, "Usar este gateway" e webhook cadastrado.
- [ ] Interruptor do modo demonstração testado em produção: desligar, abrir `/contribuir` e conferir que os textos de teste sumiram (ainda não foi clicado em produção; só nos testes locais).
- [ ] Modo demonstração **desligado**.
- [ ] Pedidos aprovados de teste estornados no painel (contam na meta e ocupam números).
- [ ] Descrição do produto em Produtos sem a frase "demonstração sem cobrança ou sorteio real".
- [ ] Instagram do pai e da mãe preenchidos em Configurações (viram os botões de `/pagamento/indisponivel`).
- [ ] Decidir o texto "Dados pessoais não são enviados nem salvos", que aparece com a demonstração ligada: não é verdadeiro, os dados vão para o servidor.

## Mercado Pago
- [ ] Aplicação criada; credenciais de **produção** no `.env`.
- [ ] Chave Pix ativa na conta Mercado Pago.
- [ ] Webhook cadastrado com a URL pública HTTPS; assinatura secreta salva no painel (ou em `MP_WEBHOOK_SECRET`).
- [ ] Teste real de R$ 5: pedido → QR → pagamento → webhook → `APPROVED` → e-mail → número aparece como vendido na grade.
- [ ] Teste de estorno pelo painel.

## E-mail
- [ ] SMTP configurado; e-mail de teste chegou na caixa de entrada (não no spam). SPF/DKIM do domínio configurados no provedor.
- [ ] Convite de admin enviado e aceito por uma segunda pessoa.

## Segurança
- [ ] HTTPS ativo; `curl -I` mostra `strict-transport-security`, `x-content-type-options`, `x-frame-options`, `content-security-policy`.
- [ ] `/admin` sem sessão redireciona para o login; `/api/admin/*` sem cookie responde 401.
- [ ] Login errado 6 vezes seguidas → bloqueio temporário.
- [ ] Nenhum CPF completo em logs, CSV exportado ou páginas públicas.

## Operação
- [ ] Backup diário testado (restaurar em banco vazio).
- [ ] Cron de expiração ou aceitar expiração preguiçosa.
- [ ] Monitoramento mínimo: UptimeRobot (ou similar) em `/api/campanha`.
- [ ] Entrada em `wiki/log.md` com data do go-live.
