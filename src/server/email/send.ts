import 'server-only';
import { audit } from '@/server/audit';
import { env } from '@/server/env';
import { templates } from './templates';
import { EMAIL_TIMEOUT_MS, emailMode, getTransport } from './transport';

/**
 * Envio de e-mail transacional (wiki/integracoes/email.md).
 *
 * Contrato: `sendEmail` NUNCA lança. Falha de e-mail não pode desfazer pedido nem sorteio;
 * o chamador recebe `{ ok: false }` e a falha fica em `AuditLog(action='email.failed')`.
 * Chamar sempre DEPOIS do commit, nunca dentro de transação de banco.
 *
 * Privacidade: o endereço do destinatário não vai para log nem para a auditoria.
 */

export type EmailTemplate = keyof typeof templates;
export type EmailData<T extends EmailTemplate> = Parameters<(typeof templates)[T]>[0];

type RenderedEmail = { subject: string; html: string; text: string };

/** Nome exibido na caixa de entrada, decidido pelo dono em 2026-10-09. */
const SENDER_NAME = 'BENJAMIM ABC';

function fromAddress(): string {
  if (env.MAIL_FROM) return env.MAIL_FROM;
  // Sem MAIL_FROM: a própria conta SMTP (o Gmail reescreve o remetente para ela de qualquer forma).
  if (env.SMTP_USER?.includes('@')) return `${SENDER_NAME} <${env.SMTP_USER}>`;
  return `${SENDER_NAME} <nao-responda@localhost>`;
}

/** `ana.silva@exemplo.com` → `a***@exemplo.com`. Só para o modo console. */
function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('tempo de envio esgotado')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function sendEmail<T extends EmailTemplate>(
  template: T,
  to: string,
  data: EmailData<T>,
): Promise<{ ok: boolean }> {
  try {
    const render = templates[template] as (input: EmailData<T>) => RenderedEmail;
    const { subject, html, text } = render(data);
    const from = fromAddress();

    const sending = getTransport().sendMail({
      from,
      to,
      replyTo: env.MAIL_REPLY_TO,
      subject,
      html,
      text,
    });
    // Se o timeout vencer a corrida, a rejeição tardia do envio não pode virar "unhandled rejection".
    sending.catch(() => {});
    await withTimeout(sending, EMAIL_TIMEOUT_MS);

    // Modo console (só development): mostra o e-mail no terminal no lugar de enviar.
    if (emailMode() === 'console' && env.NODE_ENV === 'development') {
      console.info(JSON.stringify({ template, from, to: maskEmail(to), subject, text }, null, 2));
    }

    return { ok: true };
  } catch (error) {
    // Só o nome/código do erro: a mensagem do SMTP pode conter o endereço do destinatário.
    const reason =
      error instanceof Error ? ((error as NodeJS.ErrnoException).code ?? error.name) : 'desconhecido';
    console.error(`[email] falha ao enviar "${template}" (${reason})`);

    try {
      await audit('email.failed', { meta: { template } });
    } catch {
      // Auditoria indisponível (banco fora do ar): mesmo assim não propaga.
    }

    return { ok: false };
  }
}
