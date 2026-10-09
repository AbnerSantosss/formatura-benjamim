---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-4, email, templates]
---

# T15 — E-mail transacional: transporte e templates

Duas subtarefas que podem rodar em paralelo (arquivos diferentes).

## T15a — Templates HTML
- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** nada (só a wiki).
- **Arquivos (criar):** `src/server/email/templates/base.ts`, `convite-admin.ts`, `redefinir-senha.ts`, `pedido-confirmado.ts`, `pedido-criado.ts`, `ganhador.ts`, `sorteio-realizado.ts`, `index.ts`.
- **Ler antes:** [[integracoes/email]] (tabela de templates e texto do convite).

### Passos
1. `base.ts`: `export function layout(opts: { title: string; preheader?: string; bodyHtml: string; siteUrl: string }): string` devolvendo HTML completo com `<!doctype html>`, tabela de 600 px centralizada, fundo `#f7f2e8`, card branco com borda arredondada, cabeçalho com a foto `${siteUrl}/images/benjamim-hero.jpg` (largura 120, redonda; confirmar o nome real do arquivo em `public/images/`) e o nome **BENJAMIM ABC**, corpo com fonte `Nunito, Arial, sans-serif`, botão como `<a>` com fundo `#2f5d50`, texto branco, padding 14px 24px, `border-radius: 999px`; rodapé cinza com o texto da wiki e link para `${siteUrl}/privacidade`. Funções `escapeHtml(s)` e `button(label, url)`.
2. Cada template exporta `function render(data): { subject: string; html: string; text: string }`. Versão `text` sem HTML com os mesmos links. Dados sempre escapados. Nunca incluir CPF; e-mail do destinatário só no `to`.
3. Conteúdos conforme a tabela da wiki. O convite usa exatamente o texto base da wiki, com `{{nome}}`, `{{convidadoPor}}`, `{{url}}`, botão "Definir minha senha".
4. `index.ts` exporta um mapa `templates = { 'convite-admin': render, ... }` tipado.
5. Não instalar biblioteca de template; template strings do TS bastam.

### Critério de aceite (15a)
```
npm run typecheck && npm run lint
npx tsx -e "import { templates } from './src/server/email/templates/index.ts'; const r = templates['convite-admin']({ nome:'Ana', convidadoPor:'Abner', url:'https://x/y' }); if(!r.html.includes('Definir minha senha')) throw new Error('faltou botão'); console.log('ok', r.subject)"
```

## T15b — Transporte e envio
- **Modelo:** opus.
- **Depende de:** T04.
- **Arquivos (criar):** `src/server/email/transport.ts`, `src/server/email/send.ts`, `scripts/email-test.ts`, `tests/email/send.test.ts`.

### Passos
1. `npm install nodemailer && npm install -D @types/nodemailer`.
2. `transport.ts`: se `env.SMTP_HOST` existe → `nodemailer.createTransport({ host, port, secure, auth: { user, pass } })`; senão, em dev/test → `createTransport({ jsonTransport: true })` e logar "e-mail em modo console". Singleton.
3. `send.ts`: `sendEmail(template: keyof typeof templates, to: string, data): Promise<{ ok: boolean }>`: renderiza, envia com `from: env.MAIL_FROM`, `replyTo: env.MAIL_REPLY_TO`, timeout 20 s; captura qualquer erro, grava `audit('email.failed', { meta: { template } })` (sem o endereço) e devolve `{ ok: false }`. Nunca lança.
4. `scripts/email-test.ts`: `--to x@y` envia `pedido-confirmado` com dados fictícios; script `"email:test": "tsx scripts/email-test.ts"`.
5. Testes: com transport `jsonTransport`, `sendEmail` devolve ok e o `from` contém "BENJAMIM ABC"; com transport que lança, devolve `{ ok: false }` sem exceção.

### Critério de aceite (15b)
```
npm run typecheck && npm run lint && npm test
npm run email:test -- --to teste@exemplo.com
```
Com SMTP do `.env`, o e-mail deve chegar com remetente "BENJAMIM ABC"; sem SMTP, imprime JSON.

## Não fazer
- Não colocar credenciais SMTP em código, wiki ou testes.
- Não deixar `sendEmail` lançar exceção para o chamador.
- Não enviar e-mail dentro de transação de banco.
