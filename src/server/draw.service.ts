import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import type { AdminRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { DrawError, pickWinner, type Participant } from '@/domain/draw';
import { formatNumber } from '@/domain/orders';
import { audit } from '@/server/audit';
import { prisma } from '@/server/db';
import { sendEmail } from '@/server/email/send';
import { env } from '@/server/env';
import { AppError, ForbiddenError, NotFoundError } from '@/server/errors';
import { logError } from '@/server/http';

// Serviço do sorteio (ADR 006). Regras deste arquivo:
// - aleatoriedade só de `node:crypto` (`randomBytes`, `randomInt`);
// - sortear e anular travam a linha da `Campaign` (`SELECT ... FOR UPDATE`): nunca existem dois
//   sorteios válidos ao mesmo tempo;
// - participam os números ativos de pedidos APPROVED, cada número com a mesma chance;
// - nome, e-mail e telefone do ganhador só saem daqui para as rotas `/api/admin/**`; a landing usa
//   `getCampaignSummary` (primeiro nome e número, e só com `Campaign.drawPublic`);
// - `AuditLog` nunca recebe dado pessoal; e-mails saem depois do commit e a falha deles não desfaz nada.
// O modelo `Draw` não tem coluna para "sorteio forçado": essa marca fica em `AuditLog.meta.forced`.

const CAMPAIGN_ID = 'main';
const REASON_MIN = 10;
const REASON_MAX = 500;

export type DrawActor = { id: string; role: AdminRole };

export type DrawWinner = {
  number: number;
  orderId: string;
  name: string;
  email: string;
  phone: string;
};

export type CurrentDraw = {
  id: string;
  performedAt: Date;
  /** Nome de quem acionou o sorteio no painel. */
  performedBy: string | null;
  /** Sorteado antes da data configurada, por decisão do proprietário. */
  forced: boolean;
  eligibleCount: number;
  participantsHash: string;
  seedHex: string;
  winnerNumber: number;
  winnerOrderId: string;
  /** `null` só se o pedido vencedor não existir mais. */
  winner: DrawWinner | null;
};

export type DrawState = {
  drawAt: Date | null;
  /** A data do sorteio está definida e já chegou. */
  canDraw: boolean;
  /** Sorteio válido (não anulado), se houver. */
  current: CurrentDraw | null;
  /** Números que participariam de um sorteio feito agora. */
  eligibleCount: number;
};

export type DrawEmails = { winnerSent: boolean; adminsSent: number; adminsTotal: number };

const eligibleWhere: Prisma.OrderNumberWhereInput = { active: true, order: { status: 'APPROVED' } };

const isDue = (drawAt: Date | null, now: Date) => drawAt != null && now.getTime() >= drawAt.getTime();

async function loadCurrent(): Promise<CurrentDraw | null> {
  const draw = await prisma.draw.findFirst({ where: { annulledAt: null }, orderBy: { performedAt: 'desc' } });
  if (!draw) return null;
  const [order, actor, log] = await Promise.all([
    prisma.order.findUnique({
      where: { id: draw.winnerOrderId },
      select: { contributor: { select: { name: true, email: true, phone: true } } },
    }),
    prisma.adminUser.findUnique({ where: { id: draw.performedById }, select: { name: true } }),
    prisma.auditLog.findFirst({
      where: { action: 'draw.performed', meta: { path: ['drawId'], equals: draw.id } },
      select: { meta: true },
    }),
  ]);
  const meta = log?.meta;
  const forced =
    typeof meta === 'object' && meta !== null && !Array.isArray(meta) ? meta.forced === true : false;
  return {
    id: draw.id,
    performedAt: draw.performedAt,
    performedBy: actor?.name ?? null,
    forced,
    eligibleCount: draw.eligibleCount,
    participantsHash: draw.participantsHash,
    seedHex: draw.seedHex,
    winnerNumber: draw.winnerNumber,
    winnerOrderId: draw.winnerOrderId,
    winner: order
      ? {
          number: draw.winnerNumber,
          orderId: draw.winnerOrderId,
          name: order.contributor.name,
          email: order.contributor.email,
          phone: order.contributor.phone,
        }
      : null,
  };
}

/** Estado do sorteio para o painel. Traz dados pessoais do ganhador: só para rotas `/api/admin/**`. */
export async function getDrawState(now: Date): Promise<DrawState> {
  const [campaign, current, eligibleCount] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { drawAt: true } }),
    loadCurrent(),
    prisma.orderNumber.count({ where: eligibleWhere }),
  ]);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  return { drawAt: campaign.drawAt, canDraw: isDue(campaign.drawAt, now), current, eligibleCount };
}

/**
 * E-mails do sorteio: `ganhador` para quem ganhou e `sorteio-realizado` para os admins ativos.
 * Chamar sempre DEPOIS do commit. Nunca lança.
 */
async function notifyDraw(drawId: string): Promise<DrawEmails> {
  const result: DrawEmails = { winnerSent: false, adminsSent: 0, adminsTotal: 0 };
  try {
    const draw = await prisma.draw.findUnique({ where: { id: drawId } });
    if (!draw) return result;
    const site = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
    const numero = formatNumber(draw.winnerNumber);

    const order = await prisma.order.findUnique({
      where: { id: draw.winnerOrderId },
      select: {
        id: true,
        publicToken: true,
        product: { select: { title: true } },
        contributor: { select: { name: true, email: true } },
      },
    });
    if (order) {
      const sent = await sendEmail('ganhador', order.contributor.email, {
        nome: order.contributor.name,
        numero,
        premio: order.product.title,
        linkConfirmacao: `${site}/obrigado/${order.id}?t=${encodeURIComponent(order.publicToken)}`,
      });
      result.winnerSent = sent.ok;
    }

    const admins = await prisma.adminUser.findMany({
      where: { disabledAt: null, passwordHash: { not: null } },
      select: { email: true },
    });
    result.adminsTotal = admins.length;
    for (const admin of admins) {
      const sent = await sendEmail('sorteio-realizado', admin.email, {
        numero,
        totalElegiveis: draw.eligibleCount,
        realizadoEm: draw.performedAt,
        hash: draw.participantsHash,
        linkAdmin: `${site}/admin`,
      });
      if (sent.ok) result.adminsSent += 1;
    }
  } catch (error) {
    logError('email', error);
  }
  return result;
}

/**
 * Sorteia o ganhador. Dentro de uma transação que trava a `Campaign`:
 * já existe sorteio válido → 409 `DRAW_EXISTS`; antes da data sem `force` → 409 `DRAW_NOT_YET`;
 * `force` por quem não é OWNER → 403; sem números confirmados → 409 `NO_PARTICIPANTS`.
 */
export async function performDraw(input: {
  actorId: string;
  role: AdminRole;
  force?: boolean;
  now: Date;
}): Promise<{ state: DrawState; emails: DrawEmails }> {
  const { actorId, role, now } = input;
  const force = input.force === true;

  const drawId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id" = ${CAMPAIGN_ID} FOR UPDATE`;
    const campaign = await tx.campaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { drawAt: true } });
    if (!campaign) throw new NotFoundError('Campanha não encontrada.');

    const existing = await tx.draw.findFirst({ where: { annulledAt: null }, select: { id: true } });
    if (existing) {
      throw new AppError(
        'DRAW_EXISTS',
        'O sorteio já foi realizado. Anule o atual para sortear de novo.',
        409,
      );
    }
    const due = isDue(campaign.drawAt, now);
    if (!due && !force) {
      throw new AppError('DRAW_NOT_YET', 'O sorteio só fica disponível na data configurada.', 409);
    }
    if (force && role !== 'OWNER') {
      throw new ForbiddenError('Só o proprietário pode sortear antes da data configurada.');
    }

    const rows = await tx.orderNumber.findMany({
      where: eligibleWhere,
      select: { number: true, orderId: true },
    });
    const participants: Participant[] = rows.map((row) => ({ number: row.number, orderId: row.orderId }));

    let picked;
    try {
      picked = pickWinner(participants, (max) => randomInt(0, max));
    } catch (error) {
      if (error instanceof DrawError && error.code === 'NO_PARTICIPANTS') {
        throw new AppError('NO_PARTICIPANTS', 'Ainda não há números confirmados para sortear.', 409);
      }
      throw error;
    }

    const draw = await tx.draw.create({
      data: {
        performedById: actorId,
        performedAt: now,
        eligibleCount: picked.eligibleCount,
        participantsHash: picked.hash,
        seedHex: randomBytes(32).toString('hex'),
        winnerNumber: picked.winner.number,
        winnerOrderId: picked.winner.orderId,
      },
      select: { id: true },
    });
    await audit(
      'draw.performed',
      {
        actorId,
        orderId: picked.winner.orderId,
        meta: {
          drawId: draw.id,
          forced: !due,
          eligibleCount: picked.eligibleCount,
          winnerNumber: picked.winner.number,
        },
      },
      tx,
    );
    return draw.id;
  });

  const emails = await notifyDraw(drawId);
  return { state: await getDrawState(now), emails };
}

const reasonSchema = z
  .string({ error: 'Informe o motivo da anulação.' })
  .trim()
  .min(REASON_MIN, { error: `Explique o motivo com pelo menos ${REASON_MIN} caracteres.` })
  .max(REASON_MAX, { error: `O motivo pode ter no máximo ${REASON_MAX} caracteres.` });

/**
 * Anula o sorteio válido (só OWNER, com motivo de pelo menos 10 caracteres). O registro fica no
 * banco com `annulledAt`, `annulledById` e o motivo em `notes`; depois disso pode haver novo sorteio.
 */
export async function annulDraw(input: {
  actorId: string;
  role: AdminRole;
  reason: unknown;
  now?: Date;
}): Promise<DrawState> {
  if (input.role !== 'OWNER') throw new ForbiddenError('Só o proprietário pode anular o sorteio.');
  const reason = reasonSchema.parse(input.reason);
  const now = input.now ?? new Date();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id" = ${CAMPAIGN_ID} FOR UPDATE`;
    const draw = await tx.draw.findFirst({
      where: { annulledAt: null },
      orderBy: { performedAt: 'desc' },
      select: { id: true, winnerNumber: true },
    });
    if (!draw) throw new AppError('NO_ACTIVE_DRAW', 'Não há sorteio válido para anular.', 409);
    await tx.draw.update({
      where: { id: draw.id },
      data: { annulledAt: now, annulledById: input.actorId, notes: reason },
    });
    // O texto do motivo fica só em `Draw.notes`: é livre e pode conter dado pessoal.
    await audit(
      'draw.annulled',
      { actorId: input.actorId, meta: { drawId: draw.id, winnerNumber: draw.winnerNumber } },
      tx,
    );
  });

  return getDrawState(now);
}
