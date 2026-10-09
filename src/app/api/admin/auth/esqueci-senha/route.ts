import { after } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { authErrorResponse } from '@/server/auth/require-admin';
import { RESET_TTL_MS, issueToken } from '@/server/auth/tokens';
import { randomToken } from '@/server/crypto';
import { prisma } from '@/server/db';
import { sendEmail } from '@/server/email/send';
import { env } from '@/server/env';
import { ValidationError } from '@/server/errors';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
});

// A resposta nunca sai antes disto, exista ou não o e-mail: o tempo não denuncia o cadastro.
const MIN_RESPONSE_MS = 300;

// Limite de tentativas: 5 a cada 15 minutos, por IP e por e-mail (memória do processo).
// Cópia local do limitador de `login/route.ts`, provisória até a T08 criar `src/server/rate-limit.ts`.
const LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const attempts = new Map<string, number[]>();

function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 5000) {
    for (const [k, list] of attempts) {
      if (list.every((at) => now - at >= windowMs)) attempts.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

function tooManyAttempts(retryAfterSec: number): Response {
  return Response.json(
    { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'desconhecido';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const byIp = rateLimit(`forgot:ip:${clientIp(req)}`, LIMIT);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe o e-mail.');
    const { email } = parsed.data;

    // Vale para qualquer endereço, cadastrado ou não: impede encher a caixa de alguém de e-mails.
    const byEmail = rateLimit(`forgot:email:${email}`, LIMIT);
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

    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
