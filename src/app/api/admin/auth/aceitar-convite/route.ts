import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { hashPassword, passwordPolicy } from '@/server/auth/password';
import { authErrorResponse } from '@/server/auth/require-admin';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { consumeToken, peekToken, tokenInvalidError } from '@/server/auth/tokens';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  name: z.string().trim().min(2).max(120),
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

function accountDisabled(): AppError {
  return new AppError('ACCOUNT_DISABLED', 'Este acesso está desativado.', 403);
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const ip = clientIp(req);
    const byIp = rateLimit(`invite:ip:${ip}`, LIMIT);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe seu nome e a senha.');
    const { token, name, password } = parsed.data;

    // A política vem antes do token: senha fraca não gasta o convite.
    const policy = passwordPolicy.safeParse(password);
    if (!policy.success) {
      throw new ValidationError(policy.error.issues[0]?.message ?? 'A senha não atende à política.');
    }

    // Confere o convite e o admin antes de gastar tempo com o bcrypt; o consumo é na transação.
    const peekedId = await peekToken(token, 'INVITE');
    const peeked = await prisma.adminUser.findUnique({
      where: { id: peekedId },
      select: { disabledAt: true },
    });
    if (peeked?.disabledAt) throw accountDisabled();
    const passwordHash = await hashPassword(password);

    const admin = await prisma.$transaction(async (tx) => {
      const adminId = await consumeToken(token, 'INVITE', tx);
      const user = await tx.adminUser.findUnique({
        where: { id: adminId },
        select: { disabledAt: true, passwordHash: true },
      });
      if (!user) throw tokenInvalidError();
      if (user.disabledAt !== null) throw accountDisabled();
      // Quem já tem senha não aceita convite: o caminho é "esqueci minha senha".
      if (user.passwordHash !== null) throw tokenInvalidError();

      const saved = await tx.adminUser.update({
        where: { id: adminId },
        data: { name, passwordHash, acceptedAt: new Date(), mustChangePassword: false },
        select: { id: true, name: true, email: true, role: true, mustChangePassword: true },
      });
      await tx.session.deleteMany({ where: { userId: adminId } });
      await audit('admin.invite_accepted', { actorId: adminId }, tx);
      return saved;
    });

    const session = await createSession(admin.id, false, {
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    await setSessionCookie(session.raw, session.expiresAt);

    return Response.json({ admin });
  } catch (error) {
    return authErrorResponse(error);
  }
}
