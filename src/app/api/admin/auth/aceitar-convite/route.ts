import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { hashPassword, passwordPolicy } from '@/server/auth/password';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { consumeToken, peekToken, tokenInvalidError } from '@/server/auth/tokens';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';
import { fail, getClientIp, json, tooManyAttempts } from '@/server/http';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  name: z.string().trim().min(2).max(120),
  password: z.string().max(1024),
});

function accountDisabled(): AppError {
  return new AppError('ACCOUNT_DISABLED', 'Este acesso está desativado.', 403);
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const ip = getClientIp(req);
    const byIp = rateLimit(`invite:ip:${ip}`, RATE_LIMITS.auth);
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

    return json({ admin });
  } catch (error) {
    return fail(error);
  }
}
