// Testes de integração das rotas públicas e dos webhooks: os handlers são chamados direto,
// contra o Postgres de teste (porta 5443). Nenhuma chamada de rede real: o `fetch` do adapter
// do Mercado Pago é simulado.
// Antes: docker compose -f docker-compose.test.yml up -d
import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O adapter do Mercado Pago lê as chaves quando o módulo carrega: valores fixos de teste, antes dos imports.
const MP = vi.hoisted(() => {
  const keys = { accessToken: 'TEST-access-token', webhookSecret: 'test-webhook-secret' };
  process.env.MP_ACCESS_TOKEN = keys.accessToken;
  process.env.MP_WEBHOOK_SECRET = keys.webhookSecret;
  return keys;
});

import { GET as campanha } from '@/app/api/campanha/route';
import { POST as demoAprovar } from '@/app/api/demo/aprovar/route';
import { POST as expirar } from '@/app/api/internal/expirar/route';
import { GET as ocupados } from '@/app/api/numeros/ocupados/route';
import { GET as statusDoPedido } from '@/app/api/pedidos/[id]/status/route';
import { POST as criarPedido } from '@/app/api/pedidos/route';
import { POST as webhookFastpay } from '@/app/api/webhooks/fastpay/route';
import { POST as webhookIronpay } from '@/app/api/webhooks/ironpay/route';
import { POST as webhookMercadoPago } from '@/app/api/webhooks/mercadopago/route';
import { AppError } from '@/server/errors';
import { demoGateway, demoReset } from '@/server/gateways/demo';
import { refreshPendingOrder } from '@/server/payment-sync';
import { resetRateLimits } from '@/server/rate-limit';
import { seedCatalog, testPrisma, truncateAll } from './db';

const prisma = testPrisma();
const BASE = 'http://x';
const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

type Json = Record<string, unknown>;
const bodyOf = async (res: Response) => (await res.json()) as Json;

function orderBody(numbers: number[], overrides: Json = {}): Json {
  return {
    productId: 'cestas-boticario',
    mode: 'NUMBERS',
    amountCents: numbers.length * 50,
    numbers,
    contributor: {
      name: 'Maria Teste',
      cpf: '529.982.247-25',
      phone: '(85) 99999-0000',
      email: 'maria@example.com',
    },
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const get = (path: string) => new Request(BASE + path);

async function createOrderViaApi(numbers: number[], overrides: Json = {}) {
  const res = await criarPedido(post('/api/pedidos', orderBody(numbers, overrides)));
  const body = await bodyOf(res);
  return { res, body, orderId: String(body.orderId), publicToken: String(body.publicToken) };
}

const getStatus = (orderId: string, token: string) =>
  statusDoPedido(get(`/api/pedidos/${orderId}/status?t=${encodeURIComponent(token)}`), {
    params: Promise.resolve({ id: orderId }),
  });

// --- Mercado Pago simulado -------------------------------------------------------------------

const MP_ORDER_ID = 'ORD01TESTE';
const MP_PAYMENT_ID = 'PAY01TESTE';

/** Cria um pedido pela rota e o transforma em pedido do Mercado Pago (o gateway do teste é o demo). */
async function createMercadoPagoOrder(numbers: number[]) {
  const created = await createOrderViaApi(numbers);
  await prisma.order.update({ where: { id: created.orderId }, data: { gateway: 'MERCADOPAGO' } });
  await prisma.payment.updateMany({
    where: { orderId: created.orderId },
    data: { gateway: 'MERCADOPAGO', providerOrderId: MP_ORDER_ID, providerPaymentId: MP_PAYMENT_ID },
  });
  return created;
}

/** Resposta de `GET /v1/orders/{id}` do Mercado Pago. */
function stubMercadoPagoOrder(order: {
  status: string;
  totalAmount: string;
  externalReference: string;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: MP_ORDER_ID,
          status: order.status,
          external_reference: order.externalReference,
          total_amount: order.totalAmount,
          total_paid_amount: order.totalAmount,
          transactions: { payments: [{ id: MP_PAYMENT_ID }] },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mercadoPagoWebhook(options: { requestId?: string; secret?: string } = {}): Request {
  const requestId = options.requestId ?? randomUUID();
  const ts = String(Date.now());
  const manifest = `id:${MP_ORDER_ID.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', options.secret ?? MP.webhookSecret)
    .update(manifest)
    .digest('hex');
  return post(
    `/api/webhooks/mercadopago?data.id=${MP_ORDER_ID}&type=order`,
    // O status do corpo é ignorado de propósito: quem manda é a consulta ao provedor.
    { action: 'order.processed', type: 'order', data: { id: MP_ORDER_ID, status: 'processed' } },
    { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
  );
}

beforeEach(async () => {
  resetRateLimits();
  demoReset();
  await truncateAll();
  await seedCatalog();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/pedidos', () => {
  it('cria o pedido, reserva os números e devolve o Pix', async () => {
    const { res, body, orderId } = await createOrderViaApi(range(1, 10));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.status).toBe('PENDING');
    expect(typeof body.publicToken).toBe('string');
    expect(new Date(String(body.expiresAt)).getTime()).toBeGreaterThan(Date.now());
    expect(body.pix).toEqual({
      qrCode: 'DEMO-' + orderId,
      qrCodeBase64: expect.any(String),
      ticketUrl: null,
    });
    // A resposta não devolve dado pessoal.
    expect(JSON.stringify(body)).not.toMatch(/52998224725|maria@example\.com|99999/);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { numbers: true, payments: true },
    });
    expect(order.status).toBe('PENDING');
    expect(order.amountCents).toBe(500);
    expect(order.numbers.filter((row) => row.active)).toHaveLength(10);
    expect(order.payments).toHaveLength(1);
  });

  it('ignora status e aprovação enviados pelo cliente', async () => {
    const { res, body, orderId } = await createOrderViaApi(range(1, 10), {
      status: 'APPROVED',
      approved: true,
      approvedAt: new Date().toISOString(),
    });

    expect(res.status).toBe(200);
    expect(body.status).toBe('PENDING');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('PENDING');
    expect(order.approvedAt).toBeNull();
  });

  it('reenvio com a mesma idempotencyKey devolve o mesmo pedido, sem nova cobrança', async () => {
    const payload = orderBody(range(1, 10));
    const first = await bodyOf(await criarPedido(post('/api/pedidos', payload)));
    const second = await bodyOf(await criarPedido(post('/api/pedidos', payload)));

    expect(second.orderId).toBe(first.orderId);
    expect(second.publicToken).toBe(first.publicToken);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('responde 409 NUMBERS_TAKEN com os números em conflito', async () => {
    await createOrderViaApi(range(1, 10));
    const { res, body } = await createOrderViaApi(range(6, 10));

    expect(res.status).toBe(409);
    expect(body.code).toBe('NUMBERS_TAKEN');
    expect(body.numbers).toEqual(range(6, 5));
    expect(typeof body.message).toBe('string');
    expect(await prisma.order.count()).toBe(1);
  });

  it('responde 422 com CPF inválido, sem devolver o valor recebido', async () => {
    const payload = orderBody(range(1, 10));
    (payload.contributor as Json).cpf = '111.111.111-11';
    const res = await criarPedido(post('/api/pedidos', payload));
    const body = await bodyOf(res);

    expect(res.status).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([{ path: 'contributor.cpf', message: 'CPF inválido.' }]);
    expect(JSON.stringify(body)).not.toContain('111');
    expect(await prisma.order.count()).toBe(0);
  });

  it('responde 422 com corpo que não é JSON e com valor fora da regra de pacotes', async () => {
    const malformed = await criarPedido(post('/api/pedidos', '{nao-e-json'));
    expect(malformed.status).toBe(422);

    const wrongAmount = await criarPedido(
      post('/api/pedidos', orderBody(range(1, 10), { amountCents: 499 })),
    );
    expect(wrongAmount.status).toBe(422);
    expect((await bodyOf(wrongAmount)).code).toBe('VALIDATION_ERROR');
  });

  it('falha do gateway cancela o pedido, libera os números e responde 502', async () => {
    vi.spyOn(demoGateway, 'createPixCharge').mockRejectedValueOnce(
      new AppError('GATEWAY_ERROR', 'Falha no provedor.', 502),
    );
    const { res, body } = await createOrderViaApi(range(1, 10));

    expect(res.status).toBe(502);
    expect(body.code).toBe('GATEWAY_ERROR');
    const order = await prisma.order.findFirstOrThrow({ include: { numbers: true } });
    expect(order.status).toBe('CANCELED');
    expect(order.numbers.every((row) => !row.active)).toBe(true);
    expect(await prisma.payment.count()).toBe(0);

    // Os números voltaram a ficar livres para outro pedido.
    const retry = await createOrderViaApi(range(1, 10));
    expect(retry.res.status).toBe(200);
  });

  it('gateway não configurado responde 503 e cancela o pedido', async () => {
    vi.spyOn(demoGateway, 'isConfigured').mockReturnValue(false);
    const { res, body } = await createOrderViaApi(range(1, 10));

    expect(res.status).toBe(503);
    expect(body.code).toBe('GATEWAY_NOT_CONFIGURED');
    expect((await prisma.order.findFirstOrThrow()).status).toBe('CANCELED');
  });

  it('limita a 10 pedidos por minuto por IP', async () => {
    // O último valor é o que o proxy acrescentou; o primeiro é texto do cliente e muda a cada
    // tentativa: inventar `X-Forwarded-For` não pode dar um limite novo.
    const headers = (attempt: number) => ({ 'x-forwarded-for': `198.51.100.${attempt}, 203.0.113.7` });
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await criarPedido(post('/api/pedidos', '{}', headers(attempt)));
      expect(res.status).toBe(422);
    }
    const blocked = await criarPedido(post('/api/pedidos', '{}', headers(10)));
    expect(blocked.status).toBe(429);
    expect((await bodyOf(blocked)).code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);

    // Outro IP não é afetado.
    const other = await criarPedido(post('/api/pedidos', '{}', { 'x-forwarded-for': '203.0.113.8' }));
    expect(other.status).toBe(422);
  });
});

describe('GET /api/pedidos/[id]/status', () => {
  it('devolve só status e datas com o token certo', async () => {
    const { orderId, publicToken } = await createOrderViaApi(range(1, 10));
    const res = await getStatus(orderId, publicToken);
    const body = await bodyOf(res);

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['approvedAt', 'expiresAt', 'status']);
    expect(body.status).toBe('PENDING');
    expect(body.approvedAt).toBeNull();
  });

  it('token errado, token ausente e pedido inexistente respondem 404', async () => {
    const { orderId, publicToken } = await createOrderViaApi(range(1, 10));

    const wrong = await getStatus(orderId, publicToken + 'x');
    expect(wrong.status).toBe(404);
    expect((await bodyOf(wrong)).code).toBe('NOT_FOUND');
    expect((await getStatus(orderId, '')).status).toBe(404);
    expect((await getStatus('nao-existe', publicToken)).status).toBe(404);
  });

  it('pedido pendente vencido aparece como EXPIRED', async () => {
    const { orderId, publicToken } = await createOrderViaApi(range(1, 10));
    await prisma.order.update({ where: { id: orderId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await bodyOf(await getStatus(orderId, publicToken))).status).toBe('EXPIRED');
  });
});

describe('GET /api/numeros/ocupados e /api/campanha', () => {
  it('lista os números ocupados sem cache', async () => {
    await createOrderViaApi([7, 3, 5000, 1, 2, 4, 5, 6, 8, 9]);
    const res = await ocupados(get('/api/numeros/ocupados'));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await bodyOf(res)).toEqual({ occupied: [...range(1, 9), 5000], total: 5000 });
  });

  it('resume a campanha só com dados públicos', async () => {
    const { orderId } = await createOrderViaApi(range(1, 10));
    await demoAprovar(post('/api/demo/aprovar', { orderId }));
    await createOrderViaApi(range(11, 10));

    const res = await campanha(get('/api/campanha'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await bodyOf(res)).toEqual({
      raisedCents: 500,
      goalCents: 250000,
      numbersSold: 10,
      numbersAvailable: 4980,
      drawAt: null,
      drawPublic: false,
    });
  });
});

describe('POST /api/webhooks/mercadopago', () => {
  it('assinatura válida consulta o provedor e aprova o pedido', async () => {
    const { orderId, publicToken } = await createMercadoPagoOrder(range(1, 10));
    const fetchMock = stubMercadoPagoOrder({
      status: 'processed',
      totalAmount: '5.00',
      externalReference: orderId,
    });

    const res = await webhookMercadoPago(mercadoPagoWebhook());

    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ received: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`https://api.mercadopago.com/v1/orders/${MP_ORDER_ID}`);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('APPROVED');
    expect(order.approvedAt).not.toBeNull();
    const event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event.gateway).toBe('MERCADOPAGO');
    expect(event.processedAt).not.toBeNull();
    expect(event.result).toBe('approved:APPROVED:changed');
    expect((await bodyOf(await getStatus(orderId, publicToken))).status).toBe('APPROVED');
  });

  it('o mesmo webhook duas vezes não duplica nada', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    const fetchMock = stubMercadoPagoOrder({
      status: 'processed',
      totalAmount: '5.00',
      externalReference: orderId,
    });
    const requestId = randomUUID();

    const first = await webhookMercadoPago(mercadoPagoWebhook({ requestId }));
    const second = await webhookMercadoPago(mercadoPagoWebhook({ requestId }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await bodyOf(second)).toEqual({ received: true, duplicate: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'order.approved', target: orderId } })).toBe(1);
  });

  it('assinatura inválida responde 401 e não grava nem consulta nada', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    const fetchMock = stubMercadoPagoOrder({
      status: 'processed',
      totalAmount: '5.00',
      externalReference: orderId,
    });

    const forged = await webhookMercadoPago(mercadoPagoWebhook({ secret: 'outro-segredo' }));
    expect(forged.status).toBe(401);
    expect((await bodyOf(forged)).code).toBe('INVALID_SIGNATURE');

    const unsigned = await webhookMercadoPago(post('/api/webhooks/mercadopago', { status: 'approved' }));
    expect(unsigned.status).toBe(401);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });

  it('valor pago diferente do pedido não aprova', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    stubMercadoPagoOrder({ status: 'processed', totalAmount: '4.00', externalReference: orderId });

    const res = await webhookMercadoPago(mercadoPagoWebhook());

    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    expect(await prisma.auditLog.count({ where: { action: 'order.amount_mismatch' } })).toBe(1);
  });

  it('falha depois de gravar o evento responde 200 e registra o erro', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'internal error' }), { status: 500 })),
    );

    const res = await webhookMercadoPago(mercadoPagoWebhook());

    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ received: true });
    const event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event.processedAt).toBeNull();
    expect(event.result).toMatch(/^error: GATEWAY_ERROR/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });

  it('pedido de outro gateway não é aprovado por webhook do Mercado Pago', async () => {
    const { orderId } = await createOrderViaApi(range(1, 10)); // pedido do gateway demo
    stubMercadoPagoOrder({ status: 'processed', totalAmount: '5.00', externalReference: orderId });

    const res = await webhookMercadoPago(mercadoPagoWebhook());

    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    expect((await prisma.webhookEvent.findFirstOrThrow()).result).toBe('gateway-divergente');
  });
});

describe('webhooks de FastPay e IronPay', () => {
  it('respondem 503 enquanto o adapter não está implementado', async () => {
    for (const [handler, path] of [
      [webhookFastpay, '/api/webhooks/fastpay'],
      [webhookIronpay, '/api/webhooks/ironpay'],
    ] as const) {
      const res = await handler(post(path, { status: 'approved' }));
      expect(res.status).toBe(503);
      expect((await bodyOf(res)).code).toBe('GATEWAY_NOT_IMPLEMENTED');
    }
    expect(await prisma.webhookEvent.count()).toBe(0);
  });
});

describe('consulta de reserva ao provedor (refreshPendingOrder)', () => {
  it('aprova o pedido pago e não repete a consulta antes de 30 segundos', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    const fetchMock = stubMercadoPagoOrder({
      status: 'processed',
      totalAmount: '5.00',
      externalReference: orderId,
    });
    const now = new Date();

    expect(await refreshPendingOrder(orderId, now)).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('APPROVED');

    expect(await refreshPendingOrder(orderId, new Date(now.getTime() + 10_000))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resposta do provedor sobre outro pedido não aprova este', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    stubMercadoPagoOrder({ status: 'processed', totalAmount: '5.00', externalReference: 'outro-pedido' });

    await refreshPendingOrder(orderId, new Date());

    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });

  it('cobrança ainda pendente só marca a consulta', async () => {
    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    stubMercadoPagoOrder({ status: 'action_required', totalAmount: '5.00', externalReference: orderId });

    expect(await refreshPendingOrder(orderId, new Date())).toBe(true);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId } })).lastCheckedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'order.provider_status_ignored' } })).toBe(0);
  });
});

describe('POST /api/demo/aprovar', () => {
  it('aprova o pedido de demonstração', async () => {
    const { orderId, publicToken } = await createOrderViaApi(range(1, 10));
    const res = await demoAprovar(post('/api/demo/aprovar', { orderId }));

    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ ok: true });
    expect((await bodyOf(await getStatus(orderId, publicToken))).status).toBe('APPROVED');

    // Repetir não muda nada.
    expect((await demoAprovar(post('/api/demo/aprovar', { orderId }))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'order.approved' } })).toBe(1);
  });

  it('responde 404 para pedido inexistente e para pedido de gateway real', async () => {
    expect((await demoAprovar(post('/api/demo/aprovar', { orderId: 'nao-existe' }))).status).toBe(404);

    const { orderId } = await createMercadoPagoOrder(range(1, 10));
    expect((await demoAprovar(post('/api/demo/aprovar', { orderId }))).status).toBe(404);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });

  it('não aprova pedido vencido', async () => {
    const { orderId } = await createOrderViaApi(range(1, 10));
    await prisma.order.update({ where: { id: orderId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await demoAprovar(post('/api/demo/aprovar', { orderId }));

    expect(res.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('EXPIRED');
  });
});

describe('POST /api/internal/expirar', () => {
  it('sem segredo ou com segredo errado responde 401', async () => {
    expect((await expirar(post('/api/internal/expirar', {}))).status).toBe(401);
    const wrong = await expirar(post('/api/internal/expirar', {}, { authorization: 'Bearer errado' }));
    expect(wrong.status).toBe(401);
    expect((await bodyOf(wrong)).code).toBe('UNAUTHORIZED');
  });

  it('com o segredo certo expira os pedidos vencidos', async () => {
    const stale = await createOrderViaApi(range(1, 10));
    await createOrderViaApi(range(11, 10));
    await prisma.order.update({
      where: { id: stale.orderId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await expirar(
      post('/api/internal/expirar', {}, { authorization: 'Bearer ' + process.env.CRON_SECRET }),
    );

    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ expired: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: stale.orderId } })).status).toBe('EXPIRED');
    expect(await prisma.orderNumber.count({ where: { active: true } })).toBe(10);
  });
});
