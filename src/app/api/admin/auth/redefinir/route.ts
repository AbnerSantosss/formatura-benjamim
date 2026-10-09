import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { hashPassword, passwordPolicy } from '@/server/auth/password';
import { consumeToken, peekToken, tokenInvalidError } from '@/server/auth/tokens';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';
import { fail, getClientIp, json, tooManyAttempts } from '@/server/http';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().max(1024),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const byIp = rateLimit(`reset:ip:${getClientIp(req)}`, RATE_LIMITS.auth);
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

    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
