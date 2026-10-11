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
 *
 * O navegador não manda `Origin` em GET de mesma origem: ali a checagem depende do `Referer`,
 * que extensões e ajustes de privacidade podem suprimir. Só nesse caso (nenhum dos dois
 * cabeçalhos) vale `Sec-Fetch-Site: same-origin`, que o próprio navegador preenche e que uma
 * página de outro site não consegue forjar. `Origin` ou `Referer` presente e diferente continua
 * recusado, e sem nenhum dos três a requisição é recusada.
 */
export function assertSameOrigin(req: Request): void {
  const expected = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  if (!origin && !referer && req.headers.get('sec-fetch-site') === 'same-origin') return;
  const received = originOf(origin) ?? originOf(referer);
  if (received !== expected) {
    throw new AppError('FORBIDDEN_ORIGIN', 'Requisição recusada: origem não permitida.', 403);
  }
}
