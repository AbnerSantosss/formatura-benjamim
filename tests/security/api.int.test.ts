// Testes de segurança que precisam de banco (T22): rodam com `npm run test:integration`, contra o
// Postgres de teste (porta 5443). Os handlers são chamados direto. Nenhuma chamada de rede real:
// o `fetch` do adapter do Mercado Pago é simulado e nenhum e-mail sai.
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

// `cookies()` do Next só existe dentro de uma requisição. Aqui vira um pote em memória,
// que também guarda as opções com que cada cookie foi gravado.
type StoredCookie = { value: string; options?: Record<string, unknown> };
const jar = vi.hoisted(() => ({ store: new Map<string, StoredCookie>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const found = jar.store.get(name);
      return found ? { name, value: found.value } : undefined;
    },
    has: (name: string) => jar.store.has(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.store.set(name, { value, options });
    },
    delete: (name: string) => {
      jar.store.delete(name);
    },
  }),
}));

vi.mock('@/server/email/send', () => ({ sendEmail: async () => ({ ok: true }) }));

import { POST as login } from '@/app/api/admin/auth/login/route';
import { GET as me } from '@/app/api/admin/auth/me/route';
import { PATCH as patchConfiguracoes } from '@/app/api/admin/configuracoes/route';
import { GET as metricas } from '@/app/api/admin/metricas/route';
import { POST as criarPedido } from '@/app/api/pedidos/route';
import { POST as webhookMercadoPago } from '@/app/api/webhooks/mercadopago/route';
import { env } from '@/server/env';
import { demoReset } from '@/server/gateways/demo';
import { resetRateLimits } from '@/server/rate-limit';
import { createAdmin } from '../../scripts/admin-create';
import { seedCatalog, testPrisma, truncateAll } from '../integration/db';

const prisma = testPrisma();
const ORIGIN = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
const SENHA = 'senha-de-teste-123';
const EMAIL = 'dona@teste.local';

type Json = Record<string, unknown>;
const bodyOf = async (res: Response) => (await res.json()) as Json;

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(ORIGIN + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function doLogin(password: string, forwardedFor: string, email = EMAIL) {
  return login(
    request(
      'POST',
      '/api/admin/auth/login',
      { email, password, remember: false },
      { origin: ORIGIN, 'x-forwarded-for': forwardedFor },
    ),
  );
}

async function loggedOwner() {
  await createAdmin(prisma, {
    email: EMAIL,
    name: 'Dona de Teste',
    password: SENHA,
    role: 'OWNER',
    mustChangePassword: false,
  });
  expect((await doLogin(SENHA, '10.9.0.1')).status).toBe(200);
}

// --- Mercado Pago simulado -------------------------------------------------------------------

const MP_ORDER_ID = 'ORD01SEGURANCA';

/** Pedido criado pela rota pública (gateway demo) e convertido em pedido do Mercado Pago. */
async function createMercadoPagoOrder(): Promise<string> {
  const numbers = Array.from({ length: 10 }, (_, index) => index + 1);
  const res = await criarPedido(
    request('POST', '/api/pedidos', {
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
    }),
  );
  expect(res.status).toBe(200);
  const orderId = String((await bodyOf(res)).orderId);
  await prisma.order.update({ where: { id: orderId }, data: { gateway: 'MERCADOPAGO' } });
  await prisma.payment.updateMany({
    where: { orderId },
    data: { gateway: 'MERCADOPAGO', providerOrderId: MP_ORDER_ID, providerPaymentId: 'PAY01SEGURANCA' },
  });
  return orderId;
}

/** Resposta de `GET /v1/orders/{id}` do Mercado Pago: pedido pago. */
function stubMercadoPagoPaid(orderId: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: MP_ORDER_ID,
          status: 'processed',
          external_reference: orderId,
          total_amount: '5.00',
          total_paid_amount: '5.00',
          transactions: { payments: [{ id: 'PAY01SEGURANCA' }] },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mercadoPagoWebhook(options: { requestId?: string; secret?: string; body?: unknown } = {}): Request {
  const requestId = options.requestId ?? randomUUID();
  const ts = String(Date.now());
  const manifest = `id:${MP_ORDER_ID.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', options.secret ?? MP.webhookSecret)
    .update(manifest)
    .digest('hex');
  return request(
    'POST',
    `/api/webhooks/mercadopago?data.id=${MP_ORDER_ID}&type=order`,
    options.body ?? { action: 'order.processed', type: 'order', data: { id: MP_ORDER_ID } },
    { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
  );
}

beforeEach(async () => {
  resetRateLimits();
  demoReset();
  jar.store.clear();
  await truncateAll();
  await seedCatalog();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('painel: sessão e origem', () => {
  it('GET /api/admin/metricas sem cookie responde 401, sem cache e sem dado nenhum', async () => {
    const res = await metricas();
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await bodyOf(res)).code).toBe('UNAUTHORIZED');
  });

  it('cookie inventado não vale como sessão', async () => {
    jar.store.set('bj_admin', { value: 'a'.repeat(64) });
    expect((await metricas()).status).toBe(401);
  });

  it('PATCH /api/admin/configuracoes com Origin de outro site responde 403 e não altera nada', async () => {
    await loggedOwner();
    const before = await prisma.campaign.findFirstOrThrow();

    const res = await patchConfiguracoes(
      request('PATCH', '/api/admin/configuracoes', { goalCents: 1 }, { origin: 'https://malicioso.exemplo' }),
    );
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).code).toBe('FORBIDDEN_ORIGIN');

    const semOrigem = await patchConfiguracoes(
      request('PATCH', '/api/admin/configuracoes', { goalCents: 1 }),
    );
    expect(semOrigem.status).toBe(403);

    const after = await prisma.campaign.findFirstOrThrow();
    expect(after).toEqual(before);
  });

  it('cookie de sessão sai HttpOnly e SameSite=Lax, e o banco guarda só o hash', async () => {
    await loggedOwner();
    const cookie = [...jar.store.values()].find((item) => item.options?.httpOnly !== undefined);
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    // `secure` acompanha o ambiente: ligado só em produção (aqui NODE_ENV=test).
    expect(cookie?.options?.secure).toBe(env.NODE_ENV === 'production');

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(cookie?.value);
    expect(JSON.stringify(sessions)).not.toContain(String(cookie?.value));
  });

  it('respostas de autenticação não ficam em cache', async () => {
    await loggedOwner();
    expect((await me()).headers.get('cache-control')).toBe('no-store');
    const errada = await doLogin('senha-errada-999', '10.9.0.2');
    expect(errada.status).toBe(401);
    expect(errada.headers.get('cache-control')).toBe('no-store');
  });
});

describe('limite de tentativas de login', () => {
  it('inventar o começo do X-Forwarded-For não dá um limite novo', async () => {
    // E-mail diferente a cada tentativa: sobra só o limite por IP, que é o que o teste mede.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await doLogin(
        'senha-errada-999',
        `198.51.100.${attempt}, 203.0.113.50`,
        `x${attempt}@teste.local`,
      );
      expect(res.status).toBe(401);
    }
    const sexta = await doLogin('senha-errada-999', '198.51.100.99, 203.0.113.50', 'x99@teste.local');
    expect(sexta.status).toBe(429);
    expect((await bodyOf(sexta)).code).toBe('RATE_LIMITED');
    expect(Number(sexta.headers.get('retry-after'))).toBeGreaterThan(0);

    // Outro IP visto pelo proxy segue normal.
    expect((await doLogin('senha-errada-999', '198.51.100.99, 203.0.113.51', 'x98@teste.local')).status).toBe(
      401,
    );
  });
});

describe('webhook do Mercado Pago', () => {
  it('assinatura errada responde 401 e não grava WebhookEvent nem aprova o pedido', async () => {
    const orderId = await createMercadoPagoOrder();
    const fetchMock = stubMercadoPagoPaid(orderId);

    const forged = await webhookMercadoPago(mercadoPagoWebhook({ secret: 'outro-segredo' }));
    expect(forged.status).toBe(401);
    expect((await bodyOf(forged)).code).toBe('INVALID_SIGNATURE');

    // Sem assinatura, com corpo dizendo "aprovado": o corpo nunca decide nada.
    const unsigned = await webhookMercadoPago(
      request('POST', '/api/webhooks/mercadopago', { status: 'approved', external_reference: orderId }),
    );
    expect(unsigned.status).toBe(401);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });

  it('assinatura errada com corpo que não é JSON também responde 401 (o corpo não é lido antes)', async () => {
    const res = await webhookMercadoPago(
      mercadoPagoWebhook({ secret: 'outro-segredo', body: '{não é json' }),
    );
    expect(res.status).toBe(401);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('repetir o mesmo webhook não duplica evento, aprovação nem consulta ao provedor', async () => {
    const orderId = await createMercadoPagoOrder();
    const fetchMock = stubMercadoPagoPaid(orderId);
    const requestId = randomUUID();

    const first = await webhookMercadoPago(mercadoPagoWebhook({ requestId }));
    const replay = await webhookMercadoPago(mercadoPagoWebhook({ requestId }));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await bodyOf(replay)).toMatchObject({ received: true, duplicate: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('APPROVED');
  });
});
