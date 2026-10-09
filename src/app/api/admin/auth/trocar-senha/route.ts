import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { hashPassword, passwordPolicy, verifyPassword } from '@/server/auth/password';
import { authErrorResponse, requireAdmin } from '@/server/auth/require-admin';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().max(1024),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { admin, session } = await requireAdmin({ allowPasswordChangePending: true });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe a senha atual e a nova senha.');
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError('INVALID_CURRENT_PASSWORD', 'A senha atual não confere.', 400);
    }

    const policy = passwordPolicy.safeParse(newPassword);
    if (!policy.success) {
      throw new ValidationError(policy.error.issues[0]?.message ?? 'A nova senha não atende à política.');
    }
    if (newPassword === currentPassword) {
      throw new ValidationError('A nova senha precisa ser diferente da atual.');
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // Revoga as outras sessões do usuário; a atual continua valendo.
      await tx.session.deleteMany({ where: { userId: admin.id, id: { not: session.id } } });
      await audit('auth.password_changed', { actorId: admin.id }, tx);
    });

    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
