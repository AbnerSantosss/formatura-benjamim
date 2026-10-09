import { z } from 'zod';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { verifyPassword } from '@/server/auth/password';
import { authErrorResponse } from '@/server/auth/require-admin';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { AppError, ValidationError } from '@/server/errors';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(1024),
  remember: z.boolean().optional().default(false),
});

// Hash bcrypt (custo 12) de um valor aleatório descartado. Serve só para gastar o mesmo tempo
// de `verifyPassword` quando o e-mail não existe ou o convite ainda não foi aceito.
const DUMMY_HASH = '$2b$12$Nfcf64LpPl9HOSZuJP2HEefc3nM7yDa2AKg3g1F3g9yS3fyFLm0ka';

// Limite de tentativas: 5 a cada 15 minutos, por IP e por e-mail (ADR 005: memória do processo).
// Fica local nesta rota até existir `src/server/rate-limit.ts` (T08), que tem a mesma assinatura.
const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
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
  // Limpeza oportunista para o mapa não crescer sem fim.
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

    const ip = clientIp(req);
    const byIp = rateLimit(`login:ip:${ip}`, LOGIN_LIMIT);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Informe e-mail e senha.');
    const { email, password, remember } = parsed.data;

    const byEmail = rateLimit(`login:email:${email}`, LOGIN_LIMIT);
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

    return Response.json({
      admin: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
