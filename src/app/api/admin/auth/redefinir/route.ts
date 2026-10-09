import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { hashPassword, passwordPolicy } from '@/server/auth/password';
import { authErrorResponse } from '@/server/auth/require-admin';
import { consumeToken, peekToken, tokenInvalidError } from '@/server/auth/tokens';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().max(1024),
});

// Limite de tentativas: 5 a cada 15 minutos por IP (memória do processo).
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

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const byIp = rateLimit(`reset:ip:${clientIp(req)}`, LIMIT);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe o link e a nova senha.');
    const { token, password } = parsed.data;

    // A política vem antes do token: senha fraca não gasta o link.
    const policy = passwordPolicy.safeParse(password);
    if (!policy.success) {
      throw new ValidationError(policy.error.issues[0]?.message ?? 'A senha não atende à política.');
    }

    // Confere o link antes de gastar tempo com o bcrypt; o consumo de verdade é na transação.
    await peekToken(token, 'RESET');
    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      const adminId = await consumeToken(token, 'RESET', tx);
      const user = await tx.adminUser.findUnique({
        where: { id: adminId },
        select: { disabledAt: true, passwordHash: true },
      });
      if (!user || user.passwordHash === null) throw tokenInvalidError();
      if (user.disabledAt !== null) {
        throw new AppError('ACCOUNT_DISABLED', 'Este acesso está desativado.', 403);
      }

      await tx.adminUser.update({
        where: { id: adminId },
        data: { passwordHash, mustChangePassword: false },
      });
      // Derruba todas as sessões: quem estava logado com a senha antiga precisa entrar de novo.
      await tx.session.deleteMany({ where: { userId: adminId } });
      await audit('auth.password_reset', { actorId: adminId }, tx);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
