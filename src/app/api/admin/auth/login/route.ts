import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { verifyPassword } from '@/server/auth/password';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';
import { fail, getClientIp, json, tooManyAttempts } from '@/server/http';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(1024),
  remember: z.boolean().optional().default(false),
});

// Hash bcrypt (custo 12) de um valor aleatório descartado. Serve só para gastar o mesmo tempo
// de `verifyPassword` quando o e-mail não existe ou o convite ainda não foi aceito.
const DUMMY_HASH = '$2b$12$Nfcf64LpPl9HOSZuJP2HEefc3nM7yDa2AKg3g1F3g9yS3fyFLm0ka';

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

    const ip = getClientIp(req);
    const byIp = rateLimit(`login:ip:${ip}`, RATE_LIMITS.auth);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe e-mail e senha.');
    const { email, password, remember } = parsed.data;

    const byEmail = rateLimit(`login:email:${email}`, RATE_LIMITS.auth);
    if (!byEmail.ok) return tooManyAttempts(byEmail.retryAfterSec);

    const user = await prisma.adminUser.findUnique({ where: { email } });
    // Sempre roda o bcrypt, exista ou não o e-mail, para o tempo de resposta não denunciar nada.
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || user.passwordHash === null || !passwordOk) {
      throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401);
    }
    if (user.disabledAt !== null) {
      throw new AppError('ACCOUNT_DISABLED', 'Este acesso está desativado.', 403);
    }

    const session = await createSession(user.id, remember, {
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    await setSessionCookie(session.raw, session.expiresAt);
    await audit('auth.login', { actorId: user.id, meta: { remember } });

    return json({
      admin: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
