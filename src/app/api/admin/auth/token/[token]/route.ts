import { assertSameOrigin } from '@/server/auth/csrf';
import { authErrorResponse } from '@/server/auth/require-admin';
import { peekToken } from '@/server/auth/tokens';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';

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

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'desconhecido';
}

// O link identifica uma pessoa: a resposta não pode ficar em cache nenhum.
const NO_STORE = { 'Cache-Control': 'no-store' };

function invalid(): Response {
  return Response.json({ valid: false }, { headers: NO_STORE });
}

/**
 * Diz à página de convite/redefinição se o link ainda vale, sem consumi-lo.
 * Link inexistente, usado, expirado, de outro tipo ou de admin desativado: sempre `{ valid: false }`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(req);

    const byIp = rateLimit(`token:ip:${clientIp(req)}`, LIMIT);
    if (!byIp.ok) {
      return Response.json(
        { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(byIp.retryAfterSec) } },
      );
    }

    const { token } = await params;
    const kind = new URL(req.url).searchParams.get('kind');
    if (kind !== 'INVITE' && kind !== 'RESET') return invalid();

    try {
      const adminId = await peekToken(token, kind);
      const user = await prisma.adminUser.findUnique({
        where: { id: adminId },
        select: { name: true, email: true, disabledAt: true, passwordHash: true },
      });
      if (!user || user.disabledAt !== null) return invalid();
      // Convite só vale para quem ainda não tem senha; redefinição, só para quem já tem.
      if ((kind === 'INVITE') !== (user.passwordHash === null)) return invalid();

      return Response.json({ valid: true, name: user.name, email: user.email }, { headers: NO_STORE });
    } catch (error) {
      // Nunca 500: qualquer falha na conferência vira "link inválido".
      if (!(error instanceof AppError)) {
        console.error(
          '[auth] conferência de link falhou:',
          error instanceof Error ? error.name : 'desconhecido',
        );
      }
      return invalid();
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
