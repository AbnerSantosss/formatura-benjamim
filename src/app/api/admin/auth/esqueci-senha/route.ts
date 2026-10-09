import { after } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { RESET_TTL_MS, issueToken } from '@/server/auth/tokens';
import { randomToken } from '@/server/crypto';
import { prisma } from '@/server/db';
import { sendEmail } from '@/server/email/send';
import { env } from '@/server/env';
import { ValidationError } from '@/server/errors';
import { fail, getClientIp, json, tooManyAttempts } from '@/server/http';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
});

// A resposta nunca sai antes disto, exista ou não o e-mail: o tempo não denuncia o cadastro.
const MIN_RESPONSE_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const byIp = rateLimit(`forgot:ip:${getClientIp(req)}`, RATE_LIMITS.auth);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe o e-mail.');
    const { email } = parsed.data;

    // Vale para qualquer endereço, cadastrado ou não: impede encher a caixa de alguém de e-mails.
    const byEmail = rateLimit(`forgot:email:${email}`, RATE_LIMITS.auth);
    if (!byEmail.ok) return tooManyAttempts(byEmail.retryAfterSec);

    const startedAt = Date.now();
    try {
      const user = await prisma.adminUser.findUnique({ where: { email } });
      if (user && user.disabledAt === null && user.passwordHash !== null) {
        const raw = await issueToken(user.id, 'RESET', RESET_TTL_MS);
        const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/admin/redefinir/${raw}`;
        // O envio (SMTP pode levar segundos) roda depois da resposta, para o tempo não denunciar
        // que o e-mail existe. `sendEmail` nunca lança e audita a própria falha.
        after(() => sendEmail('redefinir-senha', user.email, { nome: user.name, url }));
      } else {
        // Hash fictício: o caminho "não existe" também gera e descarta um token.
        randomToken(32);
      }
    } catch (error) {
      // Mesmo com falha interna a resposta é a mesma: nada aqui pode revelar se o e-mail existe.
      console.error('[auth] esqueci-senha falhou:', error instanceof Error ? error.name : 'desconhecido');
    }
    await sleep(Math.max(0, MIN_RESPONSE_MS - (Date.now() - startedAt)));

    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
