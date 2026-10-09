import { getOrder } from '@/server/admin.service';
import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { prisma } from '@/server/db';
import { AppError, NotFoundError } from '@/server/errors';
import { getGatewayById } from '@/server/gateways/registry';
import { describeError, fail, json } from '@/server/http';
import { markRefunded } from '@/server/orders.service';

export const dynamic = 'force-dynamic';

// Estorno: primeiro o gateway devolve o dinheiro (`refund`); só com `ok` o pedido vira REFUNDED
// e os números são liberados (`markRefunded`, que grava a auditoria com quem estornou).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        gateway: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { providerOrderId: true, providerPaymentId: true },
        },
      },
    });
    if (!order) throw new NotFoundError('Pedido não encontrado.');
    if (order.status !== 'APPROVED') {
      throw new AppError('ORDER_NOT_REFUNDABLE', 'Só pedido aprovado pode ser estornado.', 409);
    }
    const payment = order.payments[0];
    if (!payment || (!payment.providerOrderId && !payment.providerPaymentId)) {
      throw new AppError('ORDER_NOT_REFUNDABLE', 'Este pedido não tem cobrança para estornar.', 409);
    }

    let ok = false;
    try {
      const refund = await (
        await getGatewayById(order.gateway)
      ).refund({
        providerOrderId: payment.providerOrderId ?? undefined,
        providerPaymentId: payment.providerPaymentId ?? undefined,
      });
      ok = refund.ok;
    } catch (error) {
      await audit('order.refund_failed', {
        actorId: admin.id,
        orderId: id,
        meta: { reason: describeError(error) },
      });
      throw error;
    }
    if (!ok) {
      await audit('order.refund_failed', {
        actorId: admin.id,
        orderId: id,
        meta: { reason: 'recusado' },
      });
      throw new AppError('REFUND_FAILED', 'O meio de pagamento recusou o estorno. Nada foi alterado.', 502);
    }

    const result = await markRefunded(id, admin.id, { now: new Date() });
    return json({ changed: result.changed, order: await getOrder(id, new Date()) });
  } catch (error) {
    return fail(error);
  }
}
