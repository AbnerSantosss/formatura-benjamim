import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { prisma } from '@/server/db';
import { AppError, NotFoundError } from '@/server/errors';
import { fail, json, tooManyRequests } from '@/server/http';
import { sendOrderConfirmedEmail } from '@/server/payment-sync';
import { rateLimit } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

/** Reenvio do mesmo e-mail: 3 a cada 10 minutos por pedido, para o painel não virar fonte de spam. */
const RESEND_LIMIT = { limit: 3, windowMs: 10 * 60_000 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { id } = await params;

    const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw new NotFoundError('Pedido não encontrado.');
    if (order.status !== 'APPROVED') {
      throw new AppError('ORDER_NOT_APPROVED', 'Só pedido aprovado tem e-mail de confirmação.', 409);
    }

    const limit = rateLimit(`admin:reenviar-email:${id}`, RESEND_LIMIT);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

    const emailSent = await sendOrderConfirmedEmail(id);
    await audit('order.email_resent', { actorId: admin.id, orderId: id, meta: { sent: emailSent } });
    return json({ emailSent });
  } catch (error) {
    return fail(error);
  }
}
