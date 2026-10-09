// Testes de integração do serviço de pedidos contra o Postgres de teste (porta 5443).
// Antes: docker compose -f docker-compose.test.yml up -d
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewOrderInput } from '@/domain/types';
import { decryptCpf } from '@/server/crypto';
import { OrderConflictError, ValidationError } from '@/server/errors';
import {
  applyProviderStatus,
  attachPayment,
  cancelOrder,
  createOrder,
  expireStaleOrders,
  getCampaignSummary,
  getOccupiedNumbers,
  getOrderPublic,
  markRefunded,
} from '@/server/orders.service';
import { seedCatalog, testPrisma, truncateAll } from './db';

const prisma = testPrisma();
const NOW = new Date('2026-10-09T12:00:00.000Z');
const minutesAfter = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

const CPF = '52998224725'; // CPF de teste com dígitos verificadores válidos

function numbersOrder(numbers: number[], overrides: Partial<NewOrderInput> = {}): NewOrderInput {
  return {
    productId: 'cestas-boticario',
    mode: 'NUMBERS',
    amountCents: numbers.length * 50,
    numbers,
    contributor: {
      name: 'Maria Teste',
      cpf: '529.982.247-25',
      phone: '(85) 99999-0000',
      email: 'Maria@Example.com',
    },
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function extraOrder(amountCents: number): NewOrderInput {
  return numbersOrder([], { productId: 'colaboracao-avulsa', mode: 'EXTRA', amountCents });
}

const approve = (
  orderId: string,
  amountCents: number,
  now = minutesAfter(1),
  providerPaymentId = `pay-${orderId}`,
) => applyProviderStatus({ orderId, providerPaymentId, status: 'approved', amountCents, raw: {} }, { now });

beforeEach(async () => {
  await truncateAll();
  await seedCatalog();
});

describe('createOrder', () => {
  it('cria pedido NUMBERS com 10 números e R$ 5; os números ficam ocupados', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });

    expect(created.order.status).toBe('PENDING');
    expect(created.order.amountCents).toBe(500);
    expect(created.order.gateway).toBe('DEMO');
    expect(created.order.expiresAt.toISOString()).toBe(minutesAfter(10).toISOString());
    expect(created.order.numbers).toEqual(range(1, 10));
    expect(created.order.publicToken.length).toBeGreaterThanOrEqual(16);
    expect(created.product.id).toBe('cestas-boticario');
    expect(created.payment).toBeNull();
    expect(await getOccupiedNumbers(NOW)).toEqual(range(1, 10));
  });

  it('guarda o CPF só cifrado e nunca o devolve nem audita', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });

    expect(JSON.stringify(created)).not.toContain(CPF);
    expect(created.contributor).toEqual({
      id: created.contributor.id,
      name: 'Maria Teste',
      email: 'maria@example.com',
      phone: '85999990000',
      cpfLast4: '4725',
    });
    const stored = await prisma.contributor.findUniqueOrThrow({ where: { id: created.contributor.id } });
    expect(stored.cpfCipher).not.toContain(CPF);
    expect(stored.cpfCipher.split('.')).toHaveLength(3);
    expect(decryptCpf(stored.cpfCipher)).toBe(CPF);
    const logs = await prisma.auditLog.findMany();
    expect(logs.map((log) => log.action)).toEqual(['order.created']);
    expect(JSON.stringify(logs)).not.toContain(CPF);
    expect(JSON.stringify(logs)).not.toContain('maria@example.com');
  });

  it('concorrência: 5 pedidos disputando o mesmo número → 1 sucesso e 4 OrderConflictError', async () => {
    // Todos pedem o número 7; os outros 9 números de cada pedido são diferentes.
    const inputs = range(0, 5).map((index) => numbersOrder([7, ...range(100 + index * 10, 9)]));
    const results = await Promise.allSettled(inputs.map((input) => createOrder(input, { now: NOW })));

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(OrderConflictError);
      expect((result.reason as OrderConflictError).numbers).toEqual([7]);
      expect((result.reason as OrderConflictError).status).toBe(409);
    }
    // Quem perdeu não deixou nada para trás: só os 10 números do vencedor estão ocupados.
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.contributor.count()).toBe(1);
    expect(await getOccupiedNumbers(NOW)).toHaveLength(10);
  });

  it('pedido posterior com número já reservado lança OrderConflictError com os números', async () => {
    await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    const error = await createOrder(numbersOrder(range(9, 10)), { now: minutesAfter(1) }).catch((e) => e);
    expect(error).toBeInstanceOf(OrderConflictError);
    expect((error as OrderConflictError).numbers).toEqual([9, 10]);
  });

  it('mesma idempotencyKey duas vezes → mesmo order.id (com o Payment, se já houver)', async () => {
    const input = numbersOrder(range(1, 10));
    const first = await createOrder(input, { now: NOW });
    await attachPayment(first.order.id, {
      qrCode: 'copia-e-cola',
      qrCodeBase64: 'AAAA',
      raw: { demo: true },
    });
    const second = await createOrder(input, { now: minutesAfter(1) });

    expect(second.order.id).toBe(first.order.id);
    expect(second.order.numbers).toEqual(range(1, 10));
    expect(second.payment?.qrCode).toBe('copia-e-cola');
    expect(await prisma.order.count()).toBe(1);
  });

  it('valida formato (Zod) e regras de domínio antes de gravar', async () => {
    // CPF inválido
    await expect(
      createOrder(
        numbersOrder(range(1, 10), {
          contributor: {
            name: 'Maria Teste',
            cpf: '111.111.111-11',
            phone: '85999990000',
            email: 'm@example.com',
          },
        }),
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    // Valor que não é pacote de R$ 5
    await expect(createOrder(numbersOrder(range(1, 7)), { now: NOW })).rejects.toBeInstanceOf(
      ValidationError,
    );
    // Produto de outro modo
    await expect(
      createOrder(numbersOrder(range(1, 10), { productId: 'colaboracao-avulsa' }), { now: NOW }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Avulsa abaixo de R$ 5
    await expect(createOrder(extraOrder(499), { now: NOW })).rejects.toBeInstanceOf(ValidationError);
    // Produto inativo
    await prisma.product.update({ where: { id: 'cestas-boticario' }, data: { active: false } });
    await expect(createOrder(numbersOrder(range(1, 10)), { now: NOW })).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(await prisma.order.count()).toBe(0);
  });

  it('colaboração avulsa aceita centavos e não reserva números', async () => {
    const created = await createOrder(extraOrder(725), { now: NOW });
    expect(created.order.mode).toBe('EXTRA');
    expect(created.order.amountCents).toBe(725);
    expect(await getOccupiedNumbers(NOW)).toEqual([]);
  });
});

describe('expiração e cancelamento', () => {
  it('expireStaleOrders com now + 11 min expira e libera; os números voltam para um novo pedido', async () => {
    const first = await createOrder(numbersOrder(range(1, 10)), { now: NOW });

    expect(await expireStaleOrders(minutesAfter(9))).toBe(0);
    // Expiração preguiçosa: na leitura os números já aparecem livres depois do prazo.
    expect(await getOccupiedNumbers(minutesAfter(11))).toEqual([]);

    expect(await expireStaleOrders(minutesAfter(11))).toBe(1);
    const expired = await prisma.order.findUniqueOrThrow({ where: { id: first.order.id } });
    expect(expired.status).toBe('EXPIRED');
    expect(await prisma.orderNumber.count({ where: { orderId: first.order.id, active: true } })).toBe(0);
    expect(await expireStaleOrders(minutesAfter(11))).toBe(0);

    const second = await createOrder(numbersOrder(range(1, 10)), { now: minutesAfter(11) });
    expect(second.order.id).not.toBe(first.order.id);
    expect(await getOccupiedNumbers(minutesAfter(11))).toEqual(range(1, 10));
  });

  it('novo pedido consegue os números de um pendente vencido mesmo sem varredura', async () => {
    await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    const second = await createOrder(numbersOrder(range(1, 10)), { now: minutesAfter(11) });
    expect(second.order.status).toBe('PENDING');
    expect(await prisma.order.count({ where: { status: 'EXPIRED' } })).toBe(1);
  });

  it('cancelOrder leva PENDING a CANCELED e libera os números', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    expect(await cancelOrder(created.order.id, 'gateway_error')).toEqual({
      changed: true,
      status: 'CANCELED',
    });
    expect(await getOccupiedNumbers(NOW)).toEqual([]);
    expect(await cancelOrder(created.order.id, 'gateway_error')).toEqual({
      changed: false,
      status: 'CANCELED',
    });
  });
});

describe('applyProviderStatus', () => {
  it('approved aprova; chamada repetida não muda nada', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    await attachPayment(created.order.id, { qrCode: 'qr', qrCodeBase64: 'AAAA', providerOrderId: 'ord-1' });

    expect(await approve(created.order.id, 500, minutesAfter(2))).toEqual({
      changed: true,
      status: 'APPROVED',
    });
    const approved = await prisma.order.findUniqueOrThrow({
      where: { id: created.order.id },
      include: { payments: true },
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt?.toISOString()).toBe(minutesAfter(2).toISOString());
    expect(approved.payments[0].status).toBe('approved');
    expect(approved.payments[0].providerPaymentId).toBe(`pay-${created.order.id}`);

    expect(await approve(created.order.id, 500, minutesAfter(3))).toEqual({
      changed: false,
      status: 'APPROVED',
    });
    const again = await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } });
    expect(again.approvedAt?.toISOString()).toBe(minutesAfter(2).toISOString());
    expect(await prisma.auditLog.count({ where: { action: 'order.approved' } })).toBe(1);
    // Aprovado não expira: os números continuam ocupados depois do prazo da reserva.
    expect(await expireStaleOrders(minutesAfter(60))).toBe(0);
    expect(await getOccupiedNumbers(minutesAfter(60))).toEqual(range(1, 10));
  });

  it('valor diferente não aprova e registra order.amount_mismatch', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    expect(await approve(created.order.id, 499)).toEqual({ changed: false, status: 'PENDING' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe(
      'PENDING',
    );
    expect(await prisma.auditLog.count({ where: { action: 'order.amount_mismatch' } })).toBe(1);
  });

  it('em pedido expirado não aprova e registra order.paid_after_expiry', async () => {
    // Já varrido (EXPIRED no banco)
    const swept = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    await expireStaleOrders(minutesAfter(11));
    expect(await approve(swept.order.id, 500, minutesAfter(12))).toEqual({
      changed: false,
      status: 'EXPIRED',
    });

    // Vencido mas ainda PENDING no banco
    const stale = await createOrder(numbersOrder(range(21, 10)), { now: NOW });
    expect(await approve(stale.order.id, 500, minutesAfter(12))).toEqual({
      changed: false,
      status: 'EXPIRED',
    });

    expect(await prisma.order.count({ where: { status: 'APPROVED' } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'order.paid_after_expiry' } })).toBe(2);
    expect(await getOccupiedNumbers(minutesAfter(12))).toEqual([]);
  });

  it('refunded em APPROVED estorna e libera; rejected em PENDING cancela e libera', async () => {
    const paid = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    await approve(paid.order.id, 500);
    expect(
      await applyProviderStatus(
        { orderId: paid.order.id, providerPaymentId: 'p1', status: 'refunded', amountCents: 500, raw: {} },
        { now: minutesAfter(5) },
      ),
    ).toEqual({ changed: true, status: 'REFUNDED' });

    const rejected = await createOrder(numbersOrder(range(21, 10)), { now: NOW });
    expect(
      await applyProviderStatus(
        {
          orderId: rejected.order.id,
          providerPaymentId: 'p2',
          status: 'rejected',
          amountCents: 500,
          raw: {},
        },
        { now: minutesAfter(5) },
      ),
    ).toEqual({ changed: true, status: 'CANCELED' });

    expect(await getOccupiedNumbers(minutesAfter(5))).toEqual([]);
  });
});

describe('markRefunded', () => {
  it('leva APPROVED a REFUNDED, libera os números e audita com o ator', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    expect(await markRefunded(created.order.id, 'admin-1', { now: minutesAfter(1) })).toEqual({
      changed: false,
      status: 'PENDING',
    });
    await approve(created.order.id, 500);

    expect(await markRefunded(created.order.id, 'admin-1', { now: minutesAfter(30) })).toEqual({
      changed: true,
      status: 'REFUNDED',
    });
    const refunded = await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } });
    expect(refunded.refundedAt?.toISOString()).toBe(minutesAfter(30).toISOString());
    expect(await getOccupiedNumbers(minutesAfter(30))).toEqual([]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'order.refunded' } });
    expect(log.actorId).toBe('admin-1');
    expect(log.target).toBe(created.order.id);

    // Números liberados podem ser comprados de novo.
    const again = await createOrder(numbersOrder(range(1, 10)), { now: minutesAfter(31) });
    expect(again.order.status).toBe('PENDING');
  });
});

describe('getOrderPublic', () => {
  it('com token errado devolve null; com o certo devolve pedido, números, Pix, produto e primeiro nome', async () => {
    const created = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    await attachPayment(created.order.id, {
      qrCode: 'copia-e-cola',
      qrCodeBase64: 'AAAA',
      ticketUrl: 'https://x.test/t',
    });

    expect(await getOrderPublic(created.order.id, 'token-errado', { now: NOW })).toBeNull();
    expect(await getOrderPublic(created.order.id, '', { now: NOW })).toBeNull();
    expect(await getOrderPublic('nao-existe', created.order.publicToken, { now: NOW })).toBeNull();

    const view = await getOrderPublic(created.order.id, created.order.publicToken, { now: NOW });
    expect(view).toMatchObject({
      id: created.order.id,
      status: 'PENDING',
      amountCents: 500,
      numbers: range(1, 10),
      firstName: 'Maria',
      product: { id: 'cestas-boticario', title: 'Cestas O Boticário' },
      payment: { qrCode: 'copia-e-cola', qrCodeBase64: 'AAAA', ticketUrl: 'https://x.test/t' },
    });
    expect(JSON.stringify(view)).not.toContain('4725');
    expect(JSON.stringify(view)).not.toContain('example.com');

    const late = await getOrderPublic(created.order.id, created.order.publicToken, { now: minutesAfter(11) });
    expect(late?.status).toBe('EXPIRED');
  });
});

describe('getCampaignSummary', () => {
  it('soma só APPROVED no arrecadado e separa pendente, estornado e expirado', async () => {
    const paid = await createOrder(numbersOrder(range(1, 20)), { now: NOW }); // R$ 10
    await approve(paid.order.id, 1000);
    const extra = await createOrder(extraOrder(725), { now: NOW }); // R$ 7,25 avulsa
    await approve(extra.order.id, 725);
    await createOrder(numbersOrder(range(101, 10)), { now: NOW }); // pendente válido, R$ 5
    const refunded = await createOrder(numbersOrder(range(201, 10)), { now: NOW });
    await approve(refunded.order.id, 500);
    await markRefunded(refunded.order.id, 'admin-1', { now: minutesAfter(2) });
    const canceled = await createOrder(numbersOrder(range(301, 10)), { now: NOW });
    await cancelOrder(canceled.order.id, 'gateway_error');

    const summary = await getCampaignSummary(minutesAfter(3));
    expect(summary).toEqual({
      raisedCents: 1725,
      pendingCents: 500,
      refundedCents: 500,
      numbersSold: 20,
      numbersReserved: 10,
      numbersAvailable: 4970,
      ordersCount: { PENDING: 1, APPROVED: 2, EXPIRED: 0, REFUNDED: 1, CANCELED: 1 },
      goalCents: 250000,
      drawAt: null,
      drawPublic: false,
      winner: null,
    });

    // Depois do prazo, o pendente conta como expirado mesmo sem varredura.
    const later = await getCampaignSummary(minutesAfter(11));
    expect(later.raisedCents).toBe(1725);
    expect(later.pendingCents).toBe(0);
    expect(later.numbersReserved).toBe(0);
    expect(later.numbersAvailable).toBe(4980);
    expect(later.ordersCount).toMatchObject({ PENDING: 0, EXPIRED: 1 });
  });

  it('só mostra o ganhador quando drawPublic e há sorteio não anulado', async () => {
    const paid = await createOrder(numbersOrder(range(1, 10)), { now: NOW });
    await approve(paid.order.id, 500);
    await prisma.draw.create({
      data: {
        performedById: 'admin-1',
        eligibleCount: 10,
        participantsHash: 'hash',
        seedHex: '00',
        winnerNumber: 7,
        winnerOrderId: paid.order.id,
      },
    });

    expect((await getCampaignSummary(NOW)).winner).toBeNull();
    await prisma.campaign.update({ where: { id: 'main' }, data: { drawPublic: true } });
    expect((await getCampaignSummary(NOW)).winner).toEqual({ number: 7, firstName: 'Maria' });
    await prisma.draw.updateMany({ data: { annulledAt: NOW } });
    expect((await getCampaignSummary(NOW)).winner).toBeNull();
  });
});
