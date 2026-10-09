// Testes de integração do sorteio (`/api/admin/sorteio`): os handlers são chamados direto, contra o
// Postgres de teste (porta 5443), com admin logado por cookie. Nenhum e-mail real: `sendEmail` é
// simulado. Gateway: demo (o `.env.test` não tem chave de provedor).
// Antes: docker compose -f docker-compose.test.yml up -d
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `cookies()` do Next só existe dentro de uma requisição. Aqui vira um pote em memória.
const jar = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    has: (name: string) => jar.store.has(name),
    set: (name: string, value: string) => {
      jar.store.set(name, value);
    },
    delete: (name: string) => {
      jar.store.delete(name);
    },
  }),
}));

// Nenhum e-mail sai do teste: só registramos o que seria enviado.
const mail = vi.hoisted(() => ({
  sent: [] as { template: string; to: string; data: Record<string, unknown> }[],
  ok: true,
}));

vi.mock('@/server/email/send', () => ({
  sendEmail: async (template: string, to: string, data: Record<string, unknown>) => {
    mail.sent.push({ template, to, data });
    return { ok: mail.ok };
  },
}));

import { POST as login } from '@/app/api/admin/auth/login/route';
import { POST as estornar } from '@/app/api/admin/pedidos/[id]/estornar/route';
import { POST as anular } from '@/app/api/admin/sorteio/anular/route';
import { GET as estadoDoSorteio, POST as sortear } from '@/app/api/admin/sorteio/route';
import { POST as demoAprovar } from '@/app/api/demo/aprovar/route';
import { POST as criarPedido } from '@/app/api/pedidos/route';
import { participantsHash } from '@/domain/draw';
import { env } from '@/server/env';
import { demoReset } from '@/server/gateways/demo';
import { getCampaignSummary } from '@/server/orders.service';
import { resetRateLimits } from '@/server/rate-limit';
import { createAdmin } from '../../scripts/admin-create';
import { seedCatalog, testPrisma, truncateAll } from './db';

const prisma = testPrisma();
const ORIGIN = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
const SENHA = 'senha-de-teste-123';
const CPF = '529.982.247-25';
const MOTIVO = 'Pedido vencedor estornado depois do sorteio.';
const HORA_MS = 60 * 60 * 1000;
const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

type Json = Record<string, unknown>;
const bodyOf = async (res: Response) => (await res.json()) as Json;
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

/** `origin: null` simula uma chamada vinda de outro site (sem `Origin` nem `Referer`). */
function get(path: string, origin: string | null = ORIGIN) {
  return new Request(ORIGIN + path, { headers: origin ? { referer: `${origin}/admin` } : {} });
}

function send(path: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return new Request(ORIGIN + path, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const postSorteio = (body: unknown = {}) => sortear(send('/api/admin/sorteio', body));
const postAnular = (body: unknown) => anular(send('/api/admin/sorteio/anular', body));
const getEstado = () => estadoDoSorteio(get('/api/admin/sorteio'));

let seq = 0;

async function newAdmin(role: 'OWNER' | 'ADMIN', name = `${role} de Teste`) {
  seq += 1;
  const email = `${role.toLowerCase()}${seq}@teste.local`;
  const created = await createAdmin(prisma, {
    email,
    name,
    password: SENHA,
    role,
    mustChangePassword: false,
  });
  return { id: created.id, email, role };
}

/** Troca o cookie do pote pelo de `email` (login pela rota de verdade). */
async function loginAs(email: string) {
  jar.store.clear();
  seq += 1;
  const res = await login(
    new Request(`${ORIGIN}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': `10.3.0.${seq}` },
      body: JSON.stringify({ email, password: SENHA, remember: false }),
    }),
  );
  expect(res.status).toBe(200);
}

async function createOrder(numbers: number[], contributor: Json = {}) {
  seq += 1;
  const res = await criarPedido(
    new Request(`${ORIGIN}/api/pedidos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.4.0.${seq}` },
      body: JSON.stringify({
        productId: 'cestas-boticario',
        mode: 'NUMBERS',
        amountCents: numbers.length * 50,
        numbers,
        contributor: {
          name: 'Maria Teste',
          cpf: CPF,
          phone: '(85) 99999-0000',
          email: 'maria@example.com',
          ...contributor,
        },
        idempotencyKey: randomUUID(),
      }),
    }),
  );
  expect(res.status).toBe(200);
  return String((await bodyOf(res)).orderId);
}

async function approve(orderId: string) {
  const res = await demoAprovar(
    new Request(`${ORIGIN}/api/demo/aprovar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }),
  );
  expect(res.status).toBe(200);
}

async function approvedOrder(numbers: number[], contributor: Json = {}) {
  const orderId = await createOrder(numbers, contributor);
  await approve(orderId);
  return orderId;
}

/** Data do sorteio a `hours` horas de agora (negativo = já passou). */
async function setDrawAt(hours: number | null, drawPublic = false) {
  await prisma.campaign.update({
    where: { id: 'main' },
    data: { drawAt: hours === null ? null : new Date(Date.now() + hours * HORA_MS), drawPublic },
  });
}

/** E-mails do sorteio (a aprovação do pedido também manda o seu, que não interessa aqui). */
const drawMails = () =>
  mail.sent.filter((item) => item.template === 'ganhador' || item.template === 'sorteio-realizado');

const validDraws = () => prisma.draw.count({ where: { annulledAt: null } });

beforeEach(async () => {
  resetRateLimits();
  demoReset();
  jar.store.clear();
  mail.sent.length = 0;
  mail.ok = true;
  await truncateAll();
  await seedCatalog();
});

describe('acesso', () => {
  it('sem cookie as três rotas respondem 401 e nada é sorteado', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const responses = await Promise.all([getEstado(), postSorteio(), postAnular({ reason: MOTIVO })]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect((await bodyOf(res)).code).toBe('UNAUTHORIZED');
    }
    expect(await prisma.draw.count()).toBe(0);
  });

  it('chamada de outra origem é recusada com 403', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);

    const responses = await Promise.all([
      estadoDoSorteio(get('/api/admin/sorteio', null)),
      estadoDoSorteio(get('/api/admin/sorteio', 'https://outro.example')),
      sortear(send('/api/admin/sorteio', {}, null)),
      sortear(send('/api/admin/sorteio', {}, 'https://outro.example')),
      anular(send('/api/admin/sorteio/anular', { reason: MOTIVO }, null)),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect((await bodyOf(res)).code).toBe('FORBIDDEN_ORIGIN');
    }
    expect(await prisma.draw.count()).toBe(0);
  });
});

describe('estado', () => {
  it('sem data definida: canDraw falso, sem sorteio, e conta só números aprovados', async () => {
    await approvedOrder(range(1, 10));
    await createOrder(range(100, 10)); // fica PENDING
    const admin = await newAdmin('ADMIN');
    await loginAs(admin.email);

    const res = await getEstado();
    expect(res.status).toBe(200);
    const { state } = (await bodyOf(res)) as { state: Json };
    expect(state).toEqual({ drawAt: null, canDraw: false, current: null, eligibleCount: 10 });
  });

  it('canDraw acompanha a data configurada', async () => {
    const admin = await newAdmin('ADMIN');
    await loginAs(admin.email);

    await setDrawAt(2);
    expect(((await bodyOf(await getEstado())).state as Json).canDraw).toBe(false);
    await setDrawAt(-2);
    expect(((await bodyOf(await getEstado())).state as Json).canDraw).toBe(true);
  });
});

describe('sortear', () => {
  it('antes da data sem force responde 409 DRAW_NOT_YET, para ADMIN e para OWNER', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(24);
    for (const role of ['ADMIN', 'OWNER'] as const) {
      const user = await newAdmin(role);
      await loginAs(user.email);
      const res = await postSorteio();
      expect(res.status).toBe(409);
      expect((await bodyOf(res)).code).toBe('DRAW_NOT_YET');
    }
    expect(await prisma.draw.count()).toBe(0);
    expect(drawMails()).toHaveLength(0);
  });

  it('sem data definida também é "ainda não"', async () => {
    await approvedOrder(range(1, 10));
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    const res = await postSorteio();
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe('DRAW_NOT_YET');
  });

  it('force por ADMIN responde 403 e não cria sorteio', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(24);
    const admin = await newAdmin('ADMIN');
    await loginAs(admin.email);

    const res = await postSorteio({ force: true });
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).code).toBe('FORBIDDEN');
    expect(await prisma.draw.count()).toBe(0);
    expect(drawMails()).toHaveLength(0);
  });

  it('force por OWNER cria o sorteio, audita como forçado e avisa ganhador e admins', async () => {
    const orderId = await approvedOrder(range(1, 10), {
      name: 'Maria das Dores',
      email: 'maria@example.com',
    });
    await setDrawAt(24);
    const owner = await newAdmin('OWNER', 'Dono do Painel');
    const admin = await newAdmin('ADMIN');
    const convidado = await prisma.adminUser.create({
      data: { email: 'convidado@teste.local', name: 'Convidado', role: 'ADMIN' }, // sem senha: não é ativo
    });
    await loginAs(owner.email);
    mail.sent.length = 0;

    const res = await postSorteio({ force: true });
    expect(res.status).toBe(200);
    const body = (await bodyOf(res)) as { state: Json; emails: Json };
    const current = body.state.current as Json;
    const winner = current.winner as Json;

    const draws = await prisma.draw.findMany();
    expect(draws).toHaveLength(1);
    const [draw] = draws;
    expect(draw.performedById).toBe(owner.id);
    expect(draw.eligibleCount).toBe(10);
    expect(draw.winnerOrderId).toBe(orderId);
    expect(range(1, 10)).toContain(draw.winnerNumber);
    expect(draw.seedHex).toMatch(/^[0-9a-f]{64}$/);
    expect(draw.participantsHash).toBe(participantsHash(range(1, 10).map((number) => ({ number, orderId }))));
    expect(draw.annulledAt).toBeNull();

    expect(current.id).toBe(draw.id);
    expect(current.forced).toBe(true);
    expect(current.performedBy).toBe('Dono do Painel');
    expect(current.eligibleCount).toBe(10);
    expect(current.participantsHash).toBe(draw.participantsHash);
    expect(winner).toEqual({
      number: draw.winnerNumber,
      orderId,
      name: 'Maria das Dores',
      email: 'maria@example.com',
      phone: expect.any(String),
    });

    const logs = await prisma.auditLog.findMany({ where: { action: 'draw.performed' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(owner.id);
    expect(logs[0].meta).toEqual({
      drawId: draw.id,
      forced: true,
      eligibleCount: 10,
      winnerNumber: draw.winnerNumber,
    });
    expect(JSON.stringify(logs[0])).not.toContain('maria@example.com');

    const ganhador = mail.sent.filter((item) => item.template === 'ganhador');
    expect(ganhador).toHaveLength(1);
    expect(ganhador[0].to).toBe('maria@example.com');
    expect(ganhador[0].data.numero).toBe(String(draw.winnerNumber).padStart(4, '0'));
    const avisos = mail.sent.filter((item) => item.template === 'sorteio-realizado');
    expect(avisos.map((item) => item.to).sort()).toEqual([admin.email, owner.email].sort());
    expect(avisos.map((item) => item.to)).not.toContain(convidado.email);
    expect(JSON.stringify(avisos)).not.toContain('maria@example.com');
    expect(body.emails).toEqual({ winnerSent: true, adminsSent: 2, adminsTotal: 2 });
  });

  it('na data, ADMIN sorteia sem force e o registro não fica marcado como forçado', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const admin = await newAdmin('ADMIN');
    await loginAs(admin.email);

    const res = await postSorteio();
    expect(res.status).toBe(200);
    const current = ((await bodyOf(res)).state as Json).current as Json;
    expect(current.forced).toBe(false);
    expect(await validDraws()).toBe(1);
  });

  it('segundo sorteio responde 409 DRAW_EXISTS, mesmo com force', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);

    expect((await postSorteio()).status).toBe(200);
    mail.sent.length = 0;
    for (const body of [{}, { force: true }]) {
      const res = await postSorteio(body);
      expect(res.status).toBe(409);
      expect((await bodyOf(res)).code).toBe('DRAW_EXISTS');
    }
    expect(await prisma.draw.count()).toBe(1);
    expect(drawMails()).toHaveLength(0);
  });

  it('sem números confirmados responde 409 NO_PARTICIPANTS', async () => {
    await createOrder(range(1, 10)); // PENDING
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);

    const res = await postSorteio();
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe('NO_PARTICIPANTS');
    expect(await prisma.draw.count()).toBe(0);
  });

  it('corpo inválido responde 422', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    const res = await postSorteio({ force: 'sim' });
    expect(res.status).toBe(422);
    expect(await prisma.draw.count()).toBe(0);
  });

  it('falha no e-mail não desfaz o sorteio; a resposta avisa', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    mail.ok = false;

    const res = await postSorteio();
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).emails).toEqual({ winnerSent: false, adminsSent: 0, adminsTotal: 1 });
    expect(await validDraws()).toBe(1);
  });

  it('duas chamadas concorrentes criam um único sorteio', async () => {
    await approvedOrder(range(1, 10));
    await approvedOrder(range(50, 10), { name: 'José Teste', email: 'jose@example.com' });
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    mail.sent.length = 0;

    const responses = await Promise.all([postSorteio(), postSorteio(), postSorteio()]);
    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    for (const res of responses) {
      if (res.status === 409) expect((await bodyOf(res)).code).toBe('DRAW_EXISTS');
    }
    expect(await prisma.draw.count()).toBe(1);
    expect(mail.sent.filter((item) => item.template === 'ganhador')).toHaveLength(1);
  });

  it('só números de pedidos APPROVED participam (20 execuções)', async () => {
    const aprovadoA = await approvedOrder(range(1, 10), { name: 'Ana Aprovada', email: 'ana@example.com' });
    const aprovadoB = await approvedOrder(range(20, 10), { name: 'Bia Aprovada', email: 'bia@example.com' });
    const pendente = await createOrder(range(100, 40), {
      name: 'Pedro Pendente',
      email: 'pedro@example.com',
    });
    const estornado = await approvedOrder(range(200, 40), {
      name: 'Rita Estornada',
      email: 'rita@example.com',
    });
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    const refund = await estornar(send(`/api/admin/pedidos/${estornado}/estornar`), withId(estornado));
    expect(refund.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pendente } })).status).toBe('PENDING');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: estornado } })).status).toBe('REFUNDED');

    const elegiveis = [...range(1, 10), ...range(20, 10)];
    for (let rodada = 0; rodada < 20; rodada += 1) {
      const res = await postSorteio();
      expect(res.status).toBe(200);
      const state = (await bodyOf(res)).state as Json;
      const current = state.current as Json;
      expect(state.eligibleCount).toBe(20);
      expect(current.eligibleCount).toBe(20);
      expect([aprovadoA, aprovadoB]).toContain(current.winnerOrderId);
      expect(elegiveis).toContain(current.winnerNumber);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: String(current.winnerOrderId) } });
      expect(order.status).toBe('APPROVED');
      const numero = await prisma.orderNumber.findUniqueOrThrow({
        where: { orderId_number: { orderId: order.id, number: Number(current.winnerNumber) } },
      });
      expect(numero.active).toBe(true);
      expect((await postAnular({ reason: MOTIVO })).status).toBe(200);
    }
    expect(await prisma.draw.count()).toBe(20);
    expect(await validDraws()).toBe(0);
  });
});

describe('anular', () => {
  it('ADMIN não anula (403)', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const admin = await newAdmin('ADMIN');
    await loginAs(admin.email);
    expect((await postSorteio()).status).toBe(200);

    const res = await postAnular({ reason: MOTIVO });
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).code).toBe('FORBIDDEN');
    expect(await validDraws()).toBe(1);
  });

  it('motivo ausente ou com menos de 10 caracteres responde 422', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    expect((await postSorteio()).status).toBe(200);

    for (const body of [
      {},
      { reason: '' },
      { reason: 'curto' },
      { reason: '   123456789   ' },
      { reason: 42 },
    ]) {
      const res = await postAnular(body);
      expect(res.status).toBe(422);
    }
    expect(await validDraws()).toBe(1);
  });

  it('sem sorteio válido responde 409 NO_ACTIVE_DRAW', async () => {
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    const res = await postAnular({ reason: MOTIVO });
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe('NO_ACTIVE_DRAW');
  });

  it('anular registra quem, quando e por quê, e libera um novo sorteio', async () => {
    await approvedOrder(range(1, 10));
    await setDrawAt(-1);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    expect((await postSorteio()).status).toBe(200);
    const primeiro = await prisma.draw.findFirstOrThrow();

    const res = await postAnular({ reason: `  ${MOTIVO}  ` });
    expect(res.status).toBe(200);
    const state = (await bodyOf(res)).state as Json;
    expect(state.current).toBeNull();
    expect(state.canDraw).toBe(true);

    const anulado = await prisma.draw.findUniqueOrThrow({ where: { id: primeiro.id } });
    expect(anulado.annulledAt).toBeInstanceOf(Date);
    expect(anulado.annulledById).toBe(owner.id);
    expect(anulado.notes).toBe(MOTIVO);
    const logs = await prisma.auditLog.findMany({ where: { action: 'draw.annulled' } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(owner.id);
    expect(logs[0].meta).toEqual({ drawId: primeiro.id, winnerNumber: primeiro.winnerNumber });

    const denovo = await postSorteio();
    expect(denovo.status).toBe(200);
    expect(await prisma.draw.count()).toBe(2);
    expect(await validDraws()).toBe(1);
    const current = ((await bodyOf(denovo)).state as Json).current as Json;
    expect(current.id).not.toBe(primeiro.id);
  });
});

describe('landing', () => {
  it('o resumo público só mostra primeiro nome e número, e só com drawPublic', async () => {
    await approvedOrder(range(1, 10), { name: 'Maria das Dores Silva', email: 'maria@example.com' });
    await setDrawAt(-1, false);
    const owner = await newAdmin('OWNER');
    await loginAs(owner.email);
    expect((await postSorteio()).status).toBe(200);
    const draw = await prisma.draw.findFirstOrThrow();

    expect((await getCampaignSummary(new Date())).winner).toBeNull();

    await prisma.campaign.update({ where: { id: 'main' }, data: { drawPublic: true } });
    const summary = await getCampaignSummary(new Date());
    expect(summary.winner).toEqual({ number: draw.winnerNumber, firstName: 'Maria' });
    const texto = JSON.stringify(summary);
    expect(texto).not.toContain('maria@example.com');
    expect(texto).not.toContain('Dores');

    expect((await postAnular({ reason: MOTIVO })).status).toBe(200);
    expect((await getCampaignSummary(new Date())).winner).toBeNull();
  });
});
