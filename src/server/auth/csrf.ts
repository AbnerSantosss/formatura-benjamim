import 'server-only';
import { env } from '@/server/env';
import { AppError } from '@/server/errors';

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Proteção CSRF das rotas mutáveis de `/api/admin/**` (ADR 005): o `Origin` da requisição
 * (ou, na falta dele, o `Referer`) precisa ser a origem de `NEXT_PUBLIC_SITE_URL`.
 * Sem nenhum dos dois cabeçalhos a requisição é recusada.
 */
export function assertSameOrigin(req: Request): void {
  const expected = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
  const received = originOf(req.headers.get('origin')) ?? originOf(req.headers.get('referer'));
  if (received !== expected) {
    throw new AppError('FORBIDDEN_ORIGIN', 'Requisição recusada: origem não permitida.', 403);
  }
}
