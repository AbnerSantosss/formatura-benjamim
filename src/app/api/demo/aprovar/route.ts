import { z } from 'zod';
import { prisma } from '@/server/db';
import { isDemo } from '@/server/env';
import { AppError, NotFoundError } from '@/server/errors';
import { demoApprove } from '@/server/gateways/demo';
import { fail, json, readJson } from '@/server/http';
import { applyProviderStatus } from '@/server/orders.service';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ orderId: z.string().trim().min(1).max(64) });

// Simula a aprovação de um pedido do gateway de demonstração. Fora de `isDemo` a rota não existe (404).
export async function POST(req: Request) {
  try {
    if (!isDemo) throw new NotFoundError();

    const { orderId } = bodySchema.parse(await readJson(req));
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, amountCents: true, gateway: true },
    });
    // Só pedido criado no gateway demo: cobrança de gateway real nunca é aprovada por aqui.
    if (!order || order.gateway !== 'DEMO') throw new NotFoundError('Pedido não encontrado.');

    demoApprove(order.id, order.amountCents);
    const applied = await applyProviderStatus(
      {
        orderId: order.id,
        status: 'approved',
        amountCents: order.amountCents,
        providerPaymentId: 'demo-' + order.id,
      },
      { now: new Date() },
    );
    if (applied.status !== 'APPROVED') {
      throw new AppError('ORDER_NOT_APPROVABLE', 'Este pedido não pode mais ser aprovado.', 409);
    }
    if (applied.changed) {
      // TODO(T18): e-mail
    }
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
