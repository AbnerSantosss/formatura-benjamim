import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/server/env';

/**
 * Transporte de e-mail (wiki/integracoes/email.md).
 *
 * - Com `SMTP_HOST`: SMTP real (Gmail com senha de app, Brevo, Resend, Mailpit...).
 * - Sem `SMTP_HOST`, em development/test: "modo console" (`jsonTransport`), nada sai da máquina.
 * - Sem `SMTP_HOST` em produção: `env.ts` já recusa o boot; aqui é só a segunda trava.
 *
 * Nunca logar usuário, senha ou destinatário neste arquivo.
 */

/** Tempo máximo de cada etapa do SMTP e do envio inteiro (ms). */
export const EMAIL_TIMEOUT_MS = 20_000;

export type EmailMode = 'smtp' | 'console';

export function emailMode(): EmailMode {
  return env.SMTP_HOST ? 'smtp' : 'console';
}

let transporter: Transporter | undefined;

function createTransporter(): Transporter {
  if (env.SMTP_HOST) {
    const port = env.SMTP_PORT ?? 587;
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      // `false` = STARTTLS (porta 587); `true` = TLS direto (porta 465).
      secure: env.SMTP_SECURE ?? port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: EMAIL_TIMEOUT_MS,
      greetingTimeout: EMAIL_TIMEOUT_MS,
      socketTimeout: EMAIL_TIMEOUT_MS,
    });
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('SMTP_HOST é obrigatória em produção: e-mail não configurado.');
  }

  console.info('[email] e-mail em modo console (SMTP_HOST ausente): nada é enviado de verdade.');
  return nodemailer.createTransport({ jsonTransport: true });
}

/** Singleton: o transporte é criado no primeiro uso e reaproveitado. */
export function getTransport(): Transporter {
  transporter ??= createTransporter();
  return transporter;
}
