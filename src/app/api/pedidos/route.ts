import { Prisma } from '@prisma/client';
import type { Payment } from '@prisma/client';
import { newOrderSchema } from '@/domain/validation';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';
import { getGateway } from '@/server/gateways/registry';
import type { PixCharge } from '@/server/gateways/types';
import { fail, getClientIp, json, logError, readJson, tooManyRequests } from '@/server/http';
import { attachPayment, cancelOrder, createOrder, type CreatedOrder } from '@/server/orders.service';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

/** Cria a cobrança Pix do pedido no gateway ativo. Erro que não é `AppError` vira 502. */
async function createCharge(created: CreatedOrder, cpf: string): Promise<PixCharge> {
  const { order, product, contributor } = created;
  const gateway = getGateway();
  try {
    return await gateway.createPixCharge({
      order: { id: order.id, amountCents: order.amountCents, expiresAt: order.expiresAt },
      product: { title: product.title, mode: product.mode, unitCents: product.unitCents ?? 0 },
      quantity: order.mode === 'NUMBERS' ? order.numbers.length : 1,
      payer: { name: contributor.name, email: contributor.email, cpf },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logError('pedidos', error);
    throw new AppError('GATEWAY_ERROR', 'Não foi possível gerar o Pix agora. Tente novamente.', 502);
  }
}

/** Grava a cobrança. Se um envio simultâneo do mesmo formulário já gravou, devolve a que existe. */
async function savePayment(orderId: string, charge: PixCharge): Promise<Payment> {
  try {
    return await attachPayment(orderId, charge);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`pedidos:${ip}`, RATE_LIMITS.createOrder);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

    // Só os campos do schema passam: `status`, `approved` e afins enviados pelo cliente são descartados.
    const input = newOrderSchema.parse(await readJson(req));
    const now = new Date();
    const created = await createOrder(input, { now, ip });
    const { order } = created;

    let payment = created.payment;
    if (!payment) {
      // Reenvio de um formulário cujo pedido já foi cancelado ou expirou sem cobrança.
      if (order.status !== 'PENDING') {
        throw new AppError(
          'ORDER_NOT_PAYABLE',
          'Este pedido não está mais disponível. Recarregue a página e tente de novo.',
          409,
        );
      }
      try {
        // O CPF em claro só existe aqui, vindo do corpo validado, e vai direto para o gateway.
        const charge = await createCharge(created, input.contributor.cpf);
        payment = await savePayment(order.id, charge);
      } catch (error) {
        try {
          await cancelOrder(order.id, 'gateway_error');
        } catch (cancelError) {
          logError('pedidos', cancelError);
        }
        throw error;
      }
    }

    const expired = order.status === 'PENDING' && order.expiresAt.getTime() <= now.getTime();
    return json({
      orderId: order.id,
      publicToken: order.publicToken,
      expiresAt: order.expiresAt,
      status: expired ? 'EXPIRED' : order.status,
      pix: {
        qrCode: payment.qrCode,
        qrCodeBase64: payment.qrCodeBase64,
        ticketUrl: payment.ticketUrl,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
