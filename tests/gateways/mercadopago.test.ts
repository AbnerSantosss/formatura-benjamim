import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MercadoPagoConfig } from '@/server/gateways/mercadopago';

// Nenhuma chamada de rede real: `fetch` é sempre simulado.
// `@/server/env` valida process.env ao ser importado, por isso o adapter entra por import dinâmico
// depois de vi.stubEnv; os testes usam a fábrica com configuração explícita.

const TOKEN = 'TEST-token-de-mentira-0000';
const SECRET = 'segredo-de-webhook-de-mentira';
const NOW = new Date('2026-10-09T12:00:00.000Z');

const ENV_VARS = [
  'MP_ACCESS_TOKEN',
  'MP_PUBLIC_KEY',
  'MP_WEBHOOK_SECRET',
  'MP_ENVIRONMENT',
  'MP_API_FLAVOR',
  'FASTPAY_API_URL',
  'FASTPAY_API_KEY',
  'FASTPAY_WEBHOOK_SECRET',
  'IRONPAY_API_URL',
  'IRONPAY_API_KEY',
  'IRONPAY_WEBHOOK_SECRET',
];

function setEnv(vars: Record<string, string> = {}): void {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3180');
  vi.stubEnv('DATABASE_URL', 'postgresql://benjamim:benjamim@localhost:5443/benjamim_test');
  vi.stubEnv('PAYMENT_GATEWAY', 'mercadopago');
  vi.stubEnv('DEMO_MODE', 'false');
  for (const key of ENV_VARS) vi.stubEnv(key, '');
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
}

async function makeGateway(overrides: Partial<MercadoPagoConfig> = {}) {
  const { createMercadoPagoGateway } = await import('@/server/gateways/mercadopago');
  return createMercadoPagoGateway({
    accessToken: TOKEN,
    webhookSecret: SECRET,
    flavor: 'orders',
    now: () => NOW,
    ...overrides,
  });
}

const fetchMock = vi.fn();

function respond(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

/** Campos do corpo enviado que os testes leem um a um. */
type SentBody = {
  total_amount: string;
  items: unknown;
  payer: unknown;
  transactions: { payments: Array<{ expiration_time: string }> };
};

/** Última chamada ao fetch simulado, já com o corpo decodificado. */
function lastCall(): { url: string; method: string; headers: Record<string, string>; body: SentBody } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    method: String(init.method),
    headers: init.headers as Record<string, string>,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  };
}

const numbersInput = {
  order: { id: 'ord_teste_1', amountCents: 2500, expiresAt: new Date('2026-10-09T12:10:00.000Z') },
  product: { title: 'Cestas O Boticário', mode: 'NUMBERS' as const, unitCents: 50 },
  quantity: 50,
  payer: { name: 'Maria da Silva', email: 'maria@example.com', cpf: '52998224725' },
};

const extraInput = {
  order: { id: 'ord_teste_2', amountCents: 1234, expiresAt: new Date('2026-10-09T13:00:00.000Z') },
  product: { title: 'Colaboração avulsa', mode: 'EXTRA' as const, unitCents: 0 },
  quantity: 0,
  payer: { name: 'João', email: 'joao@example.com', cpf: '52998224725' },
};

const orderResponse = {
  id: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  total_amount: '25.00',
  external_reference: 'ord_teste_1',
  transactions: {
    payments: [
      {
        id: 'PAY01JQ4S4KY8HWQ6NA5PXB6E8T8Q',
        amount: '25.00',
        status: 'action_required',
        date_of_expiration: '2026-10-09T12:30:00.000+00:00',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer',
          qr_code: '00020126580014br.gov.bcb.pix-teste',
          qr_code_base64: 'iVBORw0KGgoAAAANSUhEUg==',
          ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket',
        },
      },
    ],
  },
};

const paymentResponse = {
  id: 1234567890,
  status: 'pending',
  transaction_amount: 25,
  external_reference: 'ord_teste_1',
  date_of_expiration: '2026-10-09T08:30:00.000-04:00',
  point_of_interaction: {
    transaction_data: {
      qr_code: '00020126580014br.gov.bcb.pix-teste',
      qr_code_base64: 'iVBORw0KGgoAAAANSUhEUg==',
      ticket_url: 'https://www.mercadopago.com.br/payments/1234567890/ticket',
    },
  },
};

function sign(parts: { id?: string; requestId: string; ts: string }, secret = SECRET): string {
  const manifest = (parts.id ? `id:${parts.id};` : '') + `request-id:${parts.requestId};ts:${parts.ts};`;
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

function webhook(opts: {
  query?: string;
  ts?: string;
  requestId?: string | null;
  v1?: string;
  signedId?: string;
  body?: unknown;
}) {
  const ts = opts.ts ?? String(NOW.getTime());
  const requestId = opts.requestId === undefined ? 'req-abc-123' : opts.requestId;
  const v1 = opts.v1 ?? sign({ id: opts.signedId, requestId: requestId ?? '', ts });
  const headers = new Headers({ 'x-signature': `ts=${ts},v1=${v1}` });
  if (requestId) headers.set('x-request-id', requestId);
  return {
    headers,
    url: `https://benjamim.example/api/webhooks/mercadopago${opts.query ?? ''}`,
    rawBody: JSON.stringify(opts.body ?? {}),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mercadopago: criar cobrança Pix', () => {
  it('Orders API: monta o corpo conferido na doc e extrai o QR', async () => {
    const gateway = await makeGateway({ flavor: 'orders' });
    respond(201, orderResponse);

    const charge = await gateway.createPixCharge(numbersInput);

    const call = lastCall();
    expect(call.url).toBe('https://api.mercadopago.com/v1/orders');
    expect(call.method).toBe('POST');
    expect(call.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': 'ord_teste_1',
    });
    expect(call.body).toEqual({
      type: 'online',
      external_reference: 'ord_teste_1',
      total_amount: '25.00',
      processing_mode: 'automatic',
      payer: {
        email: 'maria@example.com',
        first_name: 'Maria',
        last_name: 'da Silva',
        identification: { type: 'CPF', number: '52998224725' },
      },
      items: [{ title: 'Cestas O Boticário — 50 números', unit_price: '0.50', quantity: 50 }],
      transactions: {
        payments: [
          {
            amount: '25.00',
            payment_method: { id: 'pix', type: 'bank_transfer' },
            // Reserva local de 10 min; a doc exige no mínimo 30.
            expiration_time: 'PT30M',
          },
        ],
      },
    });

    expect(charge).toMatchObject({
      providerOrderId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
      providerPaymentId: 'PAY01JQ4S4KY8HWQ6NA5PXB6E8T8Q',
      qrCode: '00020126580014br.gov.bcb.pix-teste',
      qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUg==',
      ticketUrl: 'https://www.mercadopago.com.br/payments/1/ticket',
    });
    expect(charge.expiresAt).toEqual(new Date('2026-10-09T12:30:00.000Z'));
  });

  it('Orders API: colaboração avulsa vai como 1 item no valor do pedido e respeita reserva mais longa', async () => {
    const gateway = await makeGateway({ flavor: 'orders' });
    respond(201, { ...orderResponse, total_amount: '12.34' });

    await gateway.createPixCharge(extraInput);

    const { body } = lastCall();
    expect(body.total_amount).toBe('12.34');
    expect(body.items).toEqual([{ title: 'Colaboração avulsa', unit_price: '12.34', quantity: 1 }]);
    expect(body.payer).toEqual({
      email: 'joao@example.com',
      first_name: 'João',
      identification: { type: 'CPF', number: '52998224725' },
    });
    expect(body.transactions.payments[0].expiration_time).toBe('PT60M');
  });

  it('Payments API: monta o corpo com valores numéricos e extrai o QR', async () => {
    const gateway = await makeGateway({ flavor: 'payments' });
    respond(201, paymentResponse);

    const charge = await gateway.createPixCharge(numbersInput);

    const call = lastCall();
    expect(call.url).toBe('https://api.mercadopago.com/v1/payments');
    expect(call.headers['X-Idempotency-Key']).toBe('ord_teste_1');
    expect(call.body).toEqual({
      transaction_amount: 25,
      description: 'Cestas O Boticário — 50 números',
      payment_method_id: 'pix',
      external_reference: 'ord_teste_1',
      date_of_expiration: '2026-10-09T12:30:00.000+00:00',
      payer: {
        email: 'maria@example.com',
        first_name: 'Maria',
        last_name: 'da Silva',
        identification: { type: 'CPF', number: '52998224725' },
      },
      additional_info: {
        items: [{ title: 'Cestas O Boticário — 50 números', quantity: 50, unit_price: 0.5 }],
      },
    });

    expect(charge.providerOrderId).toBeUndefined();
    expect(charge.providerPaymentId).toBe('1234567890');
    expect(charge.qrCode).toBe('00020126580014br.gov.bcb.pix-teste');
    expect(charge.qrCodeBase64).toBe('iVBORw0KGgoAAAANSUhEUg==');
    expect(charge.expiresAt).toEqual(new Date('2026-10-09T12:30:00.000Z'));
  });

  it('resposta sem QR (criação assíncrona) vira GATEWAY_ERROR', async () => {
    const gateway = await makeGateway();
    respond(201, { id: 'ORD01', status: 'processing', transactions: { payments: [{ id: 'PAY01' }] } });

    await expect(gateway.createPixCharge(numbersInput)).rejects.toMatchObject({
      code: 'GATEWAY_ERROR',
      status: 502,
    });
  });

  it('401 vira GATEWAY_ERROR 502 com o status e a mensagem do MP, sem token nem dados pessoais', async () => {
    const gateway = await makeGateway();
    respond(401, {
      message: `invalid access token ${TOKEN} for maria@example.com cpf 52998224725`,
      status: 401,
    });

    const error = await gateway.createPixCharge(numbersInput).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'GATEWAY_ERROR', status: 502 });
    const message = (error as Error).message;
    expect(message).toContain('HTTP 401');
    expect(message).toContain('invalid access token');
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain('maria@example.com');
    expect(message).not.toContain('52998224725');
  });

  it('erro no formato da Orders API (errors[]) também é lido', async () => {
    const gateway = await makeGateway();
    respond(400, { errors: [{ code: 'invalid_total_amount', message: 'Total amount is invalid.' }] });

    await expect(gateway.createPixCharge(numbersInput)).rejects.toMatchObject({
      code: 'GATEWAY_ERROR',
      message: expect.stringContaining('HTTP 400 - Total amount is invalid.'),
    });
  });

  it('sem resposta em tempo hábil aborta e vira GATEWAY_ERROR', async () => {
    const gateway = await makeGateway({ timeoutMs: 10 });
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error(`abortado ${TOKEN}`)));
        }),
    );

    const error = await gateway.createPixCharge(numbersInput).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'GATEWAY_ERROR', status: 502 });
    expect((error as Error).message).toContain('tempo de resposta esgotado');
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('sem access token não chama a rede', async () => {
    const gateway = await makeGateway({ accessToken: undefined });

    expect(gateway.isConfigured()).toBe(false);
    await expect(gateway.createPixCharge(numbersInput)).rejects.toMatchObject({
      code: 'GATEWAY_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('mercadopago: consultar status', () => {
  it('Payments: approved mapeia para approved, com valor em centavos e external_reference', async () => {
    const gateway = await makeGateway();
    respond(200, { ...paymentResponse, status: 'approved', transaction_amount: 25.5 });

    const status = await gateway.fetchStatus({ providerPaymentId: '1234567890' });

    expect(lastCall()).toMatchObject({
      url: 'https://api.mercadopago.com/v1/payments/1234567890',
      method: 'GET',
    });
    expect(status).toMatchObject({
      status: 'approved',
      amountCents: 2550,
      providerPaymentId: '1234567890',
      externalReference: 'ord_teste_1',
    });
  });

  it('Orders: processed mapeia para approved e usa total_paid_amount', async () => {
    const gateway = await makeGateway({ flavor: 'payments' });
    respond(200, {
      ...orderResponse,
      status: 'processed',
      status_detail: 'accredited',
      total_paid_amount: '25.00',
    });

    // Tem providerOrderId: consulta a Orders API mesmo com MP_API_FLAVOR=payments.
    const status = await gateway.fetchStatus({ providerOrderId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' });

    expect(lastCall().url).toBe('https://api.mercadopago.com/v1/orders/ORD01JQ4S4KY8HWQ6NA5PXB65B3D3');
    expect(status).toMatchObject({
      status: 'approved',
      amountCents: 2500,
      providerPaymentId: 'PAY01JQ4S4KY8HWQ6NA5PXB6E8T8Q',
      externalReference: 'ord_teste_1',
    });
  });

  it('mapeia os demais status e nunca aprova um status desconhecido', async () => {
    const gateway = await makeGateway();
    const cases: Array<[string, string]> = [
      ['pending', 'pending'],
      ['in_process', 'pending'],
      ['rejected', 'rejected'],
      ['cancelled', 'rejected'],
      ['refunded', 'refunded'],
      ['charged_back', 'refunded'],
      ['status_que_nao_existe', 'pending'],
      ['constructor', 'pending'],
    ];
    for (const [provider, expected] of cases) {
      respond(200, { ...paymentResponse, status: provider });
      expect((await gateway.fetchStatus({ providerPaymentId: '1' })).status).toBe(expected);
    }

    const orderCases: Array<[string, string]> = [
      ['action_required', 'pending'],
      ['expired', 'rejected'],
      ['canceled', 'rejected'],
      ['refunded', 'refunded'],
      ['outro', 'pending'],
    ];
    for (const [provider, expected] of orderCases) {
      respond(200, { ...orderResponse, status: provider });
      expect((await gateway.fetchStatus({ providerOrderId: 'ORD01' })).status).toBe(expected);
    }
  });
});

describe('mercadopago: webhook', () => {
  it('assinatura válida do tópico payment passa e devolve o id do pagamento', async () => {
    const gateway = await makeGateway();
    const verdict = await gateway.verifyWebhook(
      webhook({
        query: '?data.id=1234567890&type=payment',
        signedId: '1234567890',
        body: { action: 'payment.updated', type: 'payment', data: { id: '1234567890' } },
      }),
    );

    expect(verdict).toEqual({ ok: true, eventId: 'req-abc-123', ref: { providerPaymentId: '1234567890' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tópico order: data.id entra em minúsculas no manifest e volta como providerOrderId', async () => {
    const gateway = await makeGateway();
    const verdict = await gateway.verifyWebhook(
      webhook({
        query: '?data.id=ORD01JQ4S4KY8HWQ6NA5PXB65B3D3&type=order',
        signedId: 'ord01jq4s4ky8hwq6na5pxb65b3d3',
        // O status do corpo é ignorado: o veredito não carrega status nem orderId.
        body: { action: 'order.processed', type: 'order', data: { id: 'x', status: 'processed' } },
      }),
    );

    expect(verdict).toEqual({
      ok: true,
      eventId: 'req-abc-123',
      ref: { providerOrderId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' },
    });
  });

  it('aceita ts em segundos e data.id só no corpo (fora do manifest)', async () => {
    const gateway = await makeGateway();
    const verdict = await gateway.verifyWebhook(
      webhook({
        ts: String(Math.floor(NOW.getTime() / 1000) - 60),
        body: { type: 'payment', data: { id: 987 } },
      }),
    );

    expect(verdict).toEqual({ ok: true, eventId: 'req-abc-123', ref: { providerPaymentId: '987' } });
  });

  it('assinatura inválida falha', async () => {
    const gateway = await makeGateway();
    const ts = String(NOW.getTime());

    // HMAC feito com outro segredo.
    expect(
      await gateway.verifyWebhook(
        webhook({
          query: '?data.id=1234567890&type=payment',
          ts,
          v1: sign({ id: '1234567890', requestId: 'req-abc-123', ts }, 'outro-segredo'),
        }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-signature' });

    // Assinatura de outro data.id.
    expect(
      await gateway.verifyWebhook(webhook({ query: '?data.id=999&type=payment', signedId: '1234567890' })),
    ).toEqual({ ok: false, reason: 'invalid-signature' });

    // v1 que nem é hexadecimal.
    expect(
      await gateway.verifyWebhook(webhook({ query: '?data.id=1&type=payment', v1: 'não-é-hex' })),
    ).toEqual({ ok: false, reason: 'invalid-signature' });
  });

  it('ts com mais de 5 minutos falha, mesmo com assinatura correta', async () => {
    const gateway = await makeGateway();
    const old = String(NOW.getTime() - 5 * 60_000 - 1);

    expect(
      await gateway.verifyWebhook(
        webhook({ query: '?data.id=1234567890&type=payment', signedId: '1234567890', ts: old }),
      ),
    ).toEqual({ ok: false, reason: 'stale-timestamp' });

    // No limite ainda passa.
    const edge = String(NOW.getTime() - 5 * 60_000);
    expect(
      await gateway.verifyWebhook(
        webhook({ query: '?data.id=1234567890&type=payment', signedId: '1234567890', ts: edge }),
      ),
    ).toMatchObject({ ok: true });
  });

  it('recusa sem cabeçalhos, sem segredo e tópicos que não tratamos', async () => {
    const gateway = await makeGateway();

    expect(
      await gateway.verifyWebhook({ headers: new Headers(), url: 'https://x.example/api', rawBody: '{}' }),
    ).toEqual({ ok: false, reason: 'missing-signature' });

    expect(
      await gateway.verifyWebhook(webhook({ query: '?data.id=1&type=payment', requestId: null })),
    ).toEqual({ ok: false, reason: 'missing-request-id' });

    expect(
      await gateway.verifyWebhook(webhook({ query: '?data.id=1&type=merchant_order', signedId: '1' })),
    ).toEqual({ ok: false, reason: 'unsupported-topic' });

    const semSegredo = await makeGateway({ webhookSecret: undefined });
    expect(semSegredo.isConfigured()).toBe(false);
    expect(
      await semSegredo.verifyWebhook(webhook({ query: '?data.id=1&type=payment', signedId: '1' })),
    ).toEqual({ ok: false, reason: 'not-configured' });
  });
});

describe('mercadopago: estorno', () => {
  it('Payments: POST /v1/payments/{id}/refunds com chave de idempotência', async () => {
    const gateway = await makeGateway();
    respond(201, { id: 555, payment_id: 1234567890, amount: 25, status: 'approved' });

    const total = await gateway.refund({ providerPaymentId: '1234567890' });

    let call = lastCall();
    expect(call.url).toBe('https://api.mercadopago.com/v1/payments/1234567890/refunds');
    expect(call.method).toBe('POST');
    expect(call.headers['X-Idempotency-Key']).toBe('refund-1234567890-full');
    expect(call.body).toBeUndefined();
    expect(total).toMatchObject({ ok: true, providerRefundId: '555' });

    respond(201, { id: 556, payment_id: 1234567890, amount: 10.5, status: 'approved' });
    await gateway.refund({ providerPaymentId: '1234567890' }, 1050);

    call = lastCall();
    expect(call.headers['X-Idempotency-Key']).toBe('refund-1234567890-1050');
    expect(call.body).toEqual({ amount: 10.5 });
  });

  it('Orders: POST /v1/orders/{id}/refund; parcial informa a transação', async () => {
    const gateway = await makeGateway();
    const ref = { providerOrderId: 'ORD01', providerPaymentId: 'PAY01' };
    respond(201, { id: 'ORD01', status: 'refunded', transactions: { refunds: [{ id: 'REF01' }] } });

    const total = await gateway.refund(ref);

    let call = lastCall();
    expect(call.url).toBe('https://api.mercadopago.com/v1/orders/ORD01/refund');
    expect(call.headers['X-Idempotency-Key']).toBe('refund-ORD01-full');
    expect(call.body).toBeUndefined();
    expect(total).toMatchObject({ ok: true, providerRefundId: 'REF01' });

    respond(201, { id: 'ORD01', status: 'processed', transactions: { refunds: [{ id: 'REF02' }] } });
    await gateway.refund(ref, 1050);

    call = lastCall();
    expect(call.body).toEqual({ transactions: [{ id: 'PAY01', amount: '10.50' }] });
  });

  it('falha do provedor no estorno vira GATEWAY_ERROR', async () => {
    const gateway = await makeGateway();
    respond(400, { message: 'refund failed' });

    await expect(gateway.refund({ providerPaymentId: '1' })).rejects.toMatchObject({
      code: 'GATEWAY_ERROR',
      status: 502,
    });
  });
});

// O registro consulta o que o painel salvou; aqui nada foi salvo (vale o ambiente).
vi.mock('@/server/gateways/stored-config', () => ({
  loadStoredGateways: async () => ({ active: null, fields: { mercadopago: {}, fastpay: {}, ironpay: {} } }),
  invalidateStoredGateways: () => {},
}));

describe('mercadopago: registro', () => {
  it('com as chaves no ambiente, o registro entrega o adapter real configurado', async () => {
    setEnv({ MP_ACCESS_TOKEN: TOKEN, MP_WEBHOOK_SECRET: SECRET });
    const { getGateway, gatewayHealth } = await import('@/server/gateways/registry');

    expect((await getGateway()).id).toBe('mercadopago');
    const health = await gatewayHealth();
    expect(health).toMatchObject({ active: 'mercadopago', configured: true });
    expect(JSON.stringify(health)).not.toContain(TOKEN);
  });

  it('sem as chaves, getGateway lança GATEWAY_NOT_CONFIGURED e não cai para o demo', async () => {
    const { getGateway } = await import('@/server/gateways/registry');
    await expect(getGateway()).rejects.toEqual(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED', status: 503 }),
    );
  });
});
