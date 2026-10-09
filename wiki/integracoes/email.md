---
tipo: integracao
atualizado: 2026-10-09
tags: [email, smtp, nodemailer, templates]
---

# Integração: e-mail transacional

## Transporte
- `nodemailer` com SMTP genérico. Funciona com Resend (SMTP), Brevo, Mailgun, Gmail com senha de app, ou Mailpit em dev.
- Variáveis: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`false` para STARTTLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (`"BENJAMIM ABC <conta@gmail.com>"`; o nome exibido na caixa de entrada é **BENJAMIM ABC**, decidido pelo dono em 2026-10-09), `MAIL_REPLY_TO` (e-mail do pai/mãe, opcional).
- Sem `SMTP_HOST`: em dev, `console` transport (imprime o e-mail no terminal). Em produção, falha no boot (`env.ts`).
- Dev local: `docker compose --profile dev up mailpit` → UI em `http://localhost:8025`.
- Envio é **assíncrono e tolerante**: falha de e-mail nunca desfaz um pedido ou sorteio; grava `AuditLog(action='email.failed')`.

## Provedor configurado (2026-10-09)
- **Gmail com senha de app** (conta dedicada de notificações). Host `smtp.gmail.com`, porta 587, STARTTLS (`SMTP_SECURE=false`).
- As credenciais estão **somente** no `.env` local do dono (ignorado pelo git) e devem ser copiadas à mão para o `.env` do servidor. Nunca gravar na wiki, no código ou no registro.
- Limite do Gmail: ~500 e-mails/dia por conta. Suficiente para a campanha; se passar disso, trocar por Brevo/Resend (só muda o `.env`).
- Entregabilidade: e-mails saem como `@gmail.com`, então SPF/DKIM já são do Google. Não usar `MAIL_FROM` com outro domínio nessa conta (Gmail reescreve o remetente).
- Teste rápido depois da T15: `npm run email:test -- --to voce@exemplo.com`.

## Templates (`src/server/email/templates/*.ts`)
Todos: HTML + texto puro, largura 600 px, tabelas (compatível com Gmail/Outlook), fonte do sistema, cores da marca (`#f7f2e8` fundo, `#2f5d50` verde, `#d99a6c` laranja), logo = foto do Benjamim (`/images/benjamim-hero.jpg` por URL absoluta). Rodapé: "Você recebeu este e-mail porque participou da campanha do Benjamim" + link de contato. Nunca incluir CPF completo.

| Template | Assunto | Quando | Conteúdo |
|---|---|---|---|
| `convite-admin` | "Você foi convidado para o painel da campanha do Benjamim" | admin convida alguém | saudação com nome, quem convidou, botão **Definir minha senha** (link com token, válido 7 dias), aviso "se não esperava este e-mail, ignore" |
| `redefinir-senha` | "Redefinição de senha — painel da campanha" | esqueci senha | botão **Criar nova senha** (válido 1 h), aviso de segurança |
| `pedido-confirmado` | "Recebemos sua contribuição 💛" | pedido aprovado | nome, valor, produto, lista de números (se NUMBERS), link `/obrigado/[id]?t=`, data do sorteio se configurada |
| `pedido-criado` (opcional, ligado por config) | "Seu Pix para a campanha do Benjamim" | pedido criado | copia e cola, validade, link de pagamento |
| `ganhador` | "Seu número foi sorteado! 🎉" | sorteio | número, prêmio, instruções de contato |
| `sorteio-realizado` | "Sorteio realizado — número NNNN" | sorteio | para admins: resumo + hash |

## Texto do convite (base)
> Olá, {{nome}}!
>
> {{convidadoPor}} convidou você para ajudar a administrar a campanha do Benjamim. No painel você acompanha as contribuições, os números e o sorteio.
>
> Clique no botão abaixo para criar sua senha e entrar. O link vale por 7 dias.
>
> [Definir minha senha]
>
> Se o botão não funcionar, copie este endereço: {{url}}
>
> Se você não esperava este convite, pode ignorar esta mensagem.

Tarefa: [[plano/tarefas/T15-email]].
