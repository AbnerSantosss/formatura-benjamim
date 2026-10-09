import { assertSameOrigin } from '@/server/auth/csrf';
import { peekToken } from '@/server/auth/tokens';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { fail, getClientIp, json, tooManyAttempts } from '@/server/http';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

function invalid(): Response {
  return json({ valid: false });
}

/**
 * Diz à página de convite/redefinição se o link ainda vale, sem consumi-lo.
 * Link inexistente, usado, expirado, de outro tipo ou de admin desativado: sempre `{ valid: false }`.
 * O link identifica uma pessoa: a resposta sai por `json()`, que nunca deixa guardar em cache.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(req);

    const byIp = rateLimit(`token:ip:${getClientIp(req)}`, RATE_LIMITS.auth);
    if (!byIp.ok) return tooManyAttempts(byIp.retryAfterSec);

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

      return json({ valid: true, name: user.name, email: user.email });
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
    return fail(error);
  }
}
