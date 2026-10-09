import 'server-only';
import { Prisma } from '@prisma/client';
import type { Gateway, Order, OrderStatus, Payment, Product } from '@prisma/client';
import { RESERVATION_MINUTES, validateOrder } from '@/domain/orders';
import type { NewOrderInput } from '@/domain/types';
import { newOrderSchema } from '@/domain/validation';
import { audit } from '@/server/audit';
import { encryptCpf, randomToken, sha256Hex, timingSafeEqualHex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { NotFoundError, OrderConflictError, ValidationError } from '@/server/errors';

// Serviço de pedidos: reserva transacional de números, expiração, aprovação e estorno.
// Regras deste arquivo:
// - não chama gateway nem envia e-mail (quem orquestra é a rota);
// - nenhum status vem do cliente: só `applyProviderStatus` (dado conferido no provedor) e as ações do admin mudam status;
// - o relógio (`now`) sempre chega por parâmetro;
// - CPF só existe cifrado (`cpfCipher`) e nunca vai para `AuditLog`.

const CAMPAIGN_ID = 'main';
const ACTIVE_NUMBER_INDEX = 'OrderNumber_number_active_unique';

type Tx = Prisma.TransactionClient;

/** `gateway`: o gateway ativo no momento do pedido; sem ele vale PAYMENT_GATEWAY. */
export type OrderContext = { now: Date; ip?: string; gateway?: Gateway };

/** Contribuinte sem CPF (nem em claro, nem cifrado). */
export type SafeContributor = { id: string; name: string; email: string; phone: string; cpfLast4: string };

export type CreatedOrder = {
  order: Order & { numbers: number[] };
  product: Product;
  contributor: SafeContributor;
  /** Preenchido quando a mesma `idempotencyKey` já tinha gerado cobrança. */
  payment: Payment | null;
};

/** Mesmo formato do `PixCharge` dos gateways (`src/server/gateways/types.ts`). */
export type PixChargeData = {
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string | null;
  expiresAt?: Date;
  raw?: unknown;
};

export type ProviderStatusEvent = {
  orderId: string;
  providerPaymentId: string;
  status: 'approved' | 'pending' | 'rejected' | 'refunded';
  amountCents: number;
  raw?: unknown;
};

export type StatusResult = { changed: boolean; status: OrderStatus };

export type PublicOrder = {
  id: string;
  status: OrderStatus;
  mode: Order['mode'];
  amountCents: number;
  createdAt: Date;
  expiresAt: Date;
  approvedAt: Date | null;
  numbers: number[];
  product: { id: string; title: string; description: string; mode: Product['mode'] };
  payment: { qrCode: string | null; qrCodeBase64: string | null; ticketUrl: string | null } | null;
  firstName: string;
};

export type CampaignSummary = {
  raisedCents: number;
  pendingCents: number;
  refundedCents: number;
  numbersSold: number;
  numbersReserved: number;
  numbersAvailable: number;
  ordersCount: Record<OrderStatus, number>;
  goalCents: number;
  drawAt: Date | null;
  drawPublic: boolean;
  winner: { number: number; firstName: string } | null;
};

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? '';

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isKnownPrismaError(
  error: unknown,
  ...codes: string[]
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && codes.includes(error.code);
}

/** Alvo do erro P2002 como texto (o Prisma devolve lista de campos ou o nome do índice). */
function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

/** Filtro de pedidos que ocupam números em `now`: aprovados ou pendentes ainda não expirados. */
function holdingOrders(now: Date): Prisma.OrderWhereInput {
  return { OR: [{ status: 'APPROVED' }, { status: 'PENDING', expiresAt: { gt: now } }] };
}

async function releaseNumbers(tx: Tx, orderId: string): Promise<void> {
  await tx.orderNumber.updateMany({ where: { orderId, active: true }, data: { active: false } });
}

/** Marca como EXPIRED os pendentes vencidos e desativa os números de todo pedido expirado. */
async function expireStaleTx(tx: Tx, now: Date): Promise<number> {
  const expired = await tx.order.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  await tx.orderNumber.updateMany({
    where: { active: true, order: { status: 'EXPIRED' } },
    data: { active: false },
  });
  return expired.count;
}

/** Trava a linha do pedido até o fim da transação e devolve o estado atual. */
async function lockOrder(tx: Tx, orderId: string): Promise<Order> {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Pedido não encontrado.');
  return order;
}

async function findByIdempotencyKey(idempotencyKey: string): Promise<CreatedOrder | null> {
  const found = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: {
      product: true,
      contributor: { select: { id: true, name: true, email: true, phone: true, cpfLast4: true } },
      numbers: { select: { number: true }, orderBy: { number: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!found) return null;
  const { product, contributor, numbers, payments, ...order } = found;
  return {
    order: { ...order, numbers: numbers.map((row) => row.number) },
    product,
    contributor,
    payment: payments[0] ?? null,
  };
}

/** Quais dos números pedidos estão ocupados agora (linhas ativas de pedidos que ainda seguram a reserva). */
async function findConflicts(numbers: number[], now: Date): Promise<number[]> {
  if (numbers.length === 0) return [];
  const rows = await prisma.orderNumber.findMany({
    where: { number: { in: numbers }, active: true, order: holdingOrders(now) },
    select: { number: true },
    orderBy: { number: 'asc' },
  });
  return rows.map((row) => row.number);
}

/**
 * Cria o pedido PENDING com a reserva dos números. A exclusividade é garantida pelo índice único
 * parcial `OrderNumber_number_active_unique`: em corrida, só uma transação grava cada número.
 */
export async function createOrder(input: NewOrderInput, ctx: OrderContext): Promise<CreatedOrder> {
  const { now } = ctx;

  const parsed = newOrderSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Pedido inválido.');
  const data = parsed.data;
  const numbers = [...data.numbers].sort((a, b) => a - b);

  // Reenvio do mesmo formulário: devolve o pedido já criado, sem validar disponibilidade de novo.
  const existing = await findByIdempotencyKey(data.idempotencyKey);
  if (existing) return existing;

  const product = await prisma.product.findUnique({ where: { id: data.productId } });
  if (!product || !product.active) throw new ValidationError('Este produto não está disponível no momento.');

  // Regras de domínio (mínimo de R$ 5, pacotes, modo do produto) e disponibilidade.
  const occupied = new Set(await getOccupiedNumbers(now));
  try {
    validateOrder(data.amountCents, data.mode, numbers, occupied, product);
  } catch (error) {
    try {
      validateOrder(data.amountCents, data.mode, numbers, new Set<number>(), product);
    } catch (ruleError) {
      throw new ValidationError(ruleError instanceof Error ? ruleError.message : 'Pedido inválido.');
    }
    const taken = numbers.filter((number) => occupied.has(number));
    if (taken.length > 0) throw new OrderConflictError(taken);
    throw new ValidationError(error instanceof Error ? error.message : 'Pedido inválido.');
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { reservationMin: true },
  });
  const reservationMin = campaign?.reservationMin ?? RESERVATION_MINUTES;
  const expiresAt = new Date(now.getTime() + reservationMin * 60_000);
  const gateway = ctx.gateway ?? (env.PAYMENT_GATEWAY.toUpperCase() as Gateway);
  const cpfCipher = encryptCpf(data.contributor.cpf);
  const cpfLast4 = data.contributor.cpf.slice(-4);

  try {
    return await prisma.$transaction(async (tx) => {
      // Pendentes vencidos ainda têm linhas ativas até alguém varrer: libera antes de reservar.
      await expireStaleTx(tx, now);

      const contributor = await tx.contributor.create({
        data: {
          name: data.contributor.name,
          email: data.contributor.email,
          phone: data.contributor.phone,
          cpfCipher,
          cpfLast4,
          createdAt: now,
        },
        select: { id: true, name: true, email: true, phone: true, cpfLast4: true },
      });
      const order = await tx.order.create({
        data: {
          publicToken: randomToken(16).raw,
          productId: product.id,
          contributorId: contributor.id,
          mode: data.mode,
          amountCents: data.amountCents,
          status: 'PENDING',
          gateway,
          expiresAt,
          idempotencyKey: data.idempotencyKey,
          createdAt: now,
        },
      });
      if (numbers.length > 0) {
        // Ordem crescente: transações concorrentes travam o índice na mesma ordem (sem deadlock).
        await tx.orderNumber.createMany({
          data: numbers.map((number) => ({ orderId: order.id, number, active: true })),
        });
      }
      await audit(
        'order.created',
        {
          orderId: order.id,
          meta: { mode: order.mode, amountCents: order.amountCents, numbersCount: numbers.length, gateway },
        },
        tx,
      );
      return { order: { ...order, numbers }, product, contributor, payment: null };
    });
  } catch (error) {
    // P2002 = violação de índice único; P2034 = conflito de escrita/deadlock entre reservas concorrentes.
    if (!isKnownPrismaError(error, 'P2002', 'P2034')) throw error;

    const target = error.code === 'P2002' ? uniqueTarget(error) : '';
    if (target.includes('idempotencyKey')) {
      // Dois envios simultâneos do mesmo formulário: o outro venceu; devolve o pedido dele.
      const winner = await findByIdempotencyKey(data.idempotencyKey);
      if (winner) return winner;
      throw error;
    }
    if (error.code === 'P2034' || target.includes('number') || target.includes(ACTIVE_NUMBER_INDEX)) {
      const taken = await findConflicts(numbers, now);
      if (taken.length > 0) throw new OrderConflictError(taken);
    }
    throw error;
  }
}

/** Grava a cobrança Pix devolvida pelo gateway. */
export async function attachPayment(orderId: string, charge: PixChargeData): Promise<Payment> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, gateway: true },
  });
  if (!order) throw new NotFoundError('Pedido não encontrado.');
  return prisma.payment.create({
    data: {
      orderId: order.id,
      gateway: order.gateway,
      providerOrderId: charge.providerOrderId ?? null,
      providerPaymentId: charge.providerPaymentId ?? null,
      qrCode: charge.qrCode,
      qrCodeBase64: charge.qrCodeBase64,
      ticketUrl: charge.ticketUrl ?? null,
      rawCreate: toJson(charge.raw),
    },
  });
}

/** PENDING -> CANCELED e libera os números. Usado quando o gateway falha ao criar a cobrança. */
export async function cancelOrder(orderId: string, reason: string): Promise<StatusResult> {
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== 'PENDING') return { changed: false, status: order.status };
    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELED' } });
    await releaseNumbers(tx, orderId);
    await audit('order.canceled', { orderId, meta: { reason } }, tx);
    return { changed: true, status: 'CANCELED' as const };
  });
}

/** Varredura: expira os pendentes vencidos e libera seus números. Devolve quantos pedidos expiraram. */
export async function expireStaleOrders(now: Date): Promise<number> {
  return prisma.$transaction((tx) => expireStaleTx(tx, now));
}

/**
 * Aplica o status conferido no provedor (webhook validado ou consulta server-to-server). Idempotente.
 * `changed` só é verdadeiro quando o evento levou o pedido a APPROVED, REFUNDED ou CANCELED;
 * o chamador usa isso para decidir se envia e-mail.
 */
export async function applyProviderStatus(
  ev: ProviderStatusEvent,
  ctx: { now: Date },
): Promise<StatusResult> {
  const { now } = ctx;
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, ev.orderId);
    const orderId = order.id;

    const payment =
      (await tx.payment.findUnique({ where: { providerPaymentId: ev.providerPaymentId } })) ??
      (await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } }));
    const setPaymentStatus = async (status: string) => {
      if (!payment || payment.orderId !== orderId) return;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          lastCheckedAt: now,
          ...(payment.providerPaymentId ? {} : { providerPaymentId: ev.providerPaymentId }),
        },
      });
    };
    const meta = {
      providerStatus: ev.status,
      providerPaymentId: ev.providerPaymentId,
      orderStatus: order.status,
      paidCents: ev.amountCents,
      expectedCents: order.amountCents,
    };

    if (ev.status === 'approved') {
      const pendingExpired = order.status === 'PENDING' && order.expiresAt.getTime() <= now.getTime();

      if (order.status === 'PENDING' && !pendingExpired) {
        if (ev.amountCents !== order.amountCents) {
          await setPaymentStatus('approved');
          await audit('order.amount_mismatch', { orderId, meta }, tx);
          return { changed: false, status: order.status };
        }
        await tx.order.update({ where: { id: orderId }, data: { status: 'APPROVED', approvedAt: now } });
        await setPaymentStatus('approved');
        await audit('order.approved', { orderId, meta }, tx);
        return { changed: true, status: 'APPROVED' as const };
      }

      if (pendingExpired || order.status === 'EXPIRED' || order.status === 'CANCELED') {
        let status = order.status;
        if (pendingExpired) {
          // O prazo já passou e ninguém varreu ainda: grava a expiração e libera os números.
          await tx.order.update({ where: { id: orderId }, data: { status: 'EXPIRED' } });
          await releaseNumbers(tx, orderId);
          status = 'EXPIRED';
        }
        // Dinheiro recebido sem pedido válido: fica registrado para o admin estornar manualmente.
        await setPaymentStatus('approved');
        await audit('order.paid_after_expiry', { orderId, meta }, tx);
        return { changed: false, status };
      }
    }

    if (ev.status === 'refunded' && order.status === 'APPROVED') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'REFUNDED', refundedAt: now } });
      await releaseNumbers(tx, orderId);
      await setPaymentStatus('refunded');
      await audit('order.refunded', { orderId, meta }, tx);
      return { changed: true, status: 'REFUNDED' as const };
    }

    if (ev.status === 'rejected' && order.status === 'PENDING') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELED' } });
      await releaseNumbers(tx, orderId);
      await setPaymentStatus('rejected');
      await audit('order.rejected', { orderId, meta }, tx);
      return { changed: true, status: 'CANCELED' as const };
    }

    // Repetição, evento fora de ordem ou combinação sem efeito (ex.: approved em APPROVED).
    await audit('order.provider_status_ignored', { orderId, meta }, tx);
    return { changed: false, status: order.status };
  });
}

/**
 * APPROVED -> REFUNDED, libera os números e registra quem estornou.
 * A chamada ao gateway é feita pela rota do admin antes desta função.
 */
export async function markRefunded(
  orderId: string,
  actorId: string,
  ctx: { now: Date },
): Promise<StatusResult> {
  const { now } = ctx;
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== 'APPROVED') return { changed: false, status: order.status };
    await tx.order.update({ where: { id: orderId }, data: { status: 'REFUNDED', refundedAt: now } });
    await releaseNumbers(tx, orderId);
    await tx.payment.updateMany({ where: { orderId, status: 'approved' }, data: { status: 'refunded' } });
    await audit(
      'order.refunded',
      { actorId, orderId, meta: { amountCents: order.amountCents, by: 'admin' } },
      tx,
    );
    return { changed: true, status: 'REFUNDED' as const };
  });
}

/**
 * Visão pública do pedido para `/pagamento/[id]` e `/obrigado/[id]`.
 * Devolve `null` se o pedido não existir ou se o token não bater (comparação em tempo constante).
 */
export async function getOrderPublic(
  id: string,
  token: string,
  ctx: { now: Date },
): Promise<PublicOrder | null> {
  const { now } = ctx;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, title: true, description: true, mode: true } },
      contributor: { select: { name: true } },
      numbers: { select: { number: true }, orderBy: { number: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  // Compara os hashes para ter tamanho fixo; sem pedido, compara com um valor que nunca bate.
  const expected = sha256Hex(order ? order.publicToken : `ausente:${id}`);
  const matches = timingSafeEqualHex(sha256Hex(String(token ?? '')), expected);
  if (!order || !matches) return null;

  const payment = order.payments[0];
  const expired = order.status === 'PENDING' && order.expiresAt.getTime() <= now.getTime();
  return {
    id: order.id,
    status: expired ? 'EXPIRED' : order.status,
    mode: order.mode,
    amountCents: order.amountCents,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    approvedAt: order.approvedAt,
    numbers: order.numbers.map((row) => row.number),
    product: order.product,
    payment: payment
      ? { qrCode: payment.qrCode, qrCodeBase64: payment.qrCodeBase64, ticketUrl: payment.ticketUrl }
      : null,
    firstName: firstNameOf(order.contributor.name),
  };
}

/** Números ocupados em `now`, em ordem crescente (pendente vencido não conta: expiração preguiçosa). */
export async function getOccupiedNumbers(now: Date): Promise<number[]> {
  const rows = await prisma.orderNumber.findMany({
    where: { active: true, order: holdingOrders(now) },
    select: { number: true },
    orderBy: { number: 'asc' },
  });
  return rows.map((row) => row.number);
}

/** Totais da campanha para a landing e o painel. Só pedido APPROVED entra no arrecadado. */
export async function getCampaignSummary(now: Date): Promise<CampaignSummary> {
  const campaign = await prisma.campaign.findUnique({ where: { id: CAMPAIGN_ID } });
  if (!campaign) throw new NotFoundError('Campanha não configurada.');

  const [byStatus, stalePending, numbersSold, numbersReserved] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.order.aggregate({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.orderNumber.count({ where: { active: true, order: { status: 'APPROVED' } } }),
    prisma.orderNumber.count({
      where: { active: true, order: { status: 'PENDING', expiresAt: { gt: now } } },
    }),
  ]);

  const ordersCount: Record<OrderStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    EXPIRED: 0,
    REFUNDED: 0,
    CANCELED: 0,
  };
  const cents: Record<OrderStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    EXPIRED: 0,
    REFUNDED: 0,
    CANCELED: 0,
  };
  for (const row of byStatus) {
    ordersCount[row.status] = row._count._all;
    cents[row.status] = row._sum.amountCents ?? 0;
  }
  // Pendente vencido que ainda não foi varrido conta como expirado.
  ordersCount.PENDING -= stalePending._count._all;
  ordersCount.EXPIRED += stalePending._count._all;
  cents.PENDING -= stalePending._sum.amountCents ?? 0;

  let winner: CampaignSummary['winner'] = null;
  if (campaign.drawPublic) {
    const draw = await prisma.draw.findFirst({
      where: { annulledAt: null },
      orderBy: { performedAt: 'desc' },
    });
    if (draw) {
      const winnerOrder = await prisma.order.findUnique({
        where: { id: draw.winnerOrderId },
        select: { contributor: { select: { name: true } } },
      });
      if (winnerOrder) {
        winner = { number: draw.winnerNumber, firstName: firstNameOf(winnerOrder.contributor.name) };
      }
    }
  }

  return {
    raisedCents: cents.APPROVED,
    pendingCents: cents.PENDING,
    refundedCents: cents.REFUNDED,
    numbersSold,
    numbersReserved,
    numbersAvailable: Math.max(0, campaign.totalNumbers - numbersSold - numbersReserved),
    ordersCount,
    goalCents: campaign.goalCents,
    drawAt: campaign.drawAt,
    drawPublic: campaign.drawPublic,
    winner,
  };
}
