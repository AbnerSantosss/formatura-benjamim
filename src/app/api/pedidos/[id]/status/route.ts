import { env } from '@/server/env';
import { NotFoundError } from '@/server/errors';
import { fail, getClientIp, json, tooManyRequests } from '@/server/http';
import { getOrderPublic } from '@/server/orders.service';
import { refreshPendingOrder } from '@/server/payment-sync';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = rateLimit(`status:${getClientIp(req)}`, RATE_LIMITS.publicGet);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

    const { id } = await params;
    const token = new URL(req.url).searchParams.get('t') ?? '';
    const now = new Date();

    // Sem token certo a resposta é a mesma de pedido inexistente.
    let order = await getOrderPublic(id, token, { now });
    if (!order) throw new NotFoundError('Pedido não encontrado.');

    // Reserva para webhook atrasado: consulta o provedor (no máximo a cada 30 s por cobrança).
    if (order.status === 'PENDING' && env.PAYMENT_GATEWAY !== 'demo') {
      const checked = await refreshPendingOrder(id, now);
      if (checked) order = (await getOrderPublic(id, token, { now })) ?? order;
    }

    return json({ status: order.status, expiresAt: order.expiresAt, approvedAt: order.approvedAt });
  } catch (error) {
    return fail(error);
  }
}
