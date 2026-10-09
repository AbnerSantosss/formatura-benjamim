import { sha256Hex, timingSafeEqualHex } from '@/server/crypto';
import { env } from '@/server/env';
import { AppError } from '@/server/errors';
import { fail, json } from '@/server/http';
import { expireStaleOrders } from '@/server/orders.service';

export const dynamic = 'force-dynamic';

/** Compara o header com `Bearer CRON_SECRET` em tempo constante (pelos hashes, de tamanho fixo). */
function isAuthorized(req: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const received = req.headers.get('authorization') ?? '';
  return timingSafeEqualHex(sha256Hex(received), sha256Hex(`Bearer ${env.CRON_SECRET}`));
}

// Varredura de pedidos vencidos, para cron externo.
export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) throw new AppError('UNAUTHORIZED', 'Não autorizado.', 401);
    const expired = await expireStaleOrders(new Date());
    return json({ expired });
  } catch (error) {
    return fail(error);
  }
}
