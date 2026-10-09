---
tipo: operacao
atualizado: 2026-10-09
tags: [checklist, producao, go-live]
---

# Checklist de produção

## Antes do deploy
- [ ] `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build` verdes.
- [ ] `.env` de produção preenchido; `DEMO_MODE` ausente ou `false`; `PAYMENT_GATEWAY=mercadopago`.
- [ ] `AUTH_SECRET` e `CPF_ENCRYPTION_KEY` gerados e guardados em cofre.
- [ ] Textos legais (`/termos`, `/privacidade`, `/regulamento`) revisados pelo organizador ([[decisoes/001-rifa-com-numeros-e-sorteio]]).
- [ ] Data do sorteio decidida (pode ser configurada depois no painel).

## Mercado Pago
- [ ] Aplicação criada; credenciais de **produção** no `.env`.
- [ ] Chave Pix ativa na conta Mercado Pago.
- [ ] Webhook cadastrado com a URL pública HTTPS; `MP_WEBHOOK_SECRET` copiado.
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
