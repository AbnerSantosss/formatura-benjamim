// Testes de integração da API do painel (`/api/admin/**`): os handlers são chamados direto, contra o
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
import { GET as getConfiguracoes, PATCH as patchConfiguracoes } from '@/app/api/admin/configuracoes/route';
import { POST as expirar } from '@/app/api/admin/expirar/route';
import { GET as exportarCsv } from '@/app/api/admin/exportar.csv/route';
import { GET as metricas } from '@/app/api/admin/metricas/route';
import { POST as estornar } from '@/app/api/admin/pedidos/[id]/estornar/route';
import { POST as reenviarEmail } from '@/app/api/admin/pedidos/[id]/reenviar-email/route';
import { GET as detalheDoPedido } from '@/app/api/admin/pedidos/[id]/route';
import { GET as listarPedidos } from '@/app/api/admin/pedidos/route';
import { PATCH as patchProduto } from '@/app/api/admin/produtos/[id]/route';
import { GET as listarProdutos, PATCH as patchProdutos } from '@/app/api/admin/produtos/route';
import { POST as reenviarConvite } from '@/app/api/admin/usuarios/[id]/reenviar-convite/route';
import { PATCH as patchUsuario } from '@/app/api/admin/usuarios/[id]/route';
import { GET as listarUsuarios, POST as convidar } from '@/app/api/admin/usuarios/route';
import { POST as demoAprovar } from '@/app/api/demo/aprovar/route';
import { POST as criarPedido } from '@/app/api/pedidos/route';
import { deactivateAdmin } from '@/server/admin.service';
import { env } from '@/server/env';
import { AppError } from '@/server/errors';
import { demoReset } from '@/server/gateways/demo';
import { resetRateLimits } from '@/server/rate-limit';
import { createAdmin } from '../../scripts/admin-create';
import { seedCatalog, testPrisma, truncateAll } from './db';

const prisma = testPrisma();
const ORIGIN = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
const SENHA = 'senha-de-teste-123';
const CPF = '529.982.247-25';
const CPF_DIGITOS = '52998224725';
const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

type Json = Record<string, unknown>;
const bodyOf = async (res: Response) => (await res.json()) as Json;
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

const get = (path: string) => new Request(ORIGIN + path);

/** Requisição mutável. `origin: null` simula uma chamada vinda de outro site. */
function send(method: 'POST' | 'PATCH', path: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return new Request(ORIGIN + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

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
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': `10.1.0.${seq}` },
      body: JSON.stringify({ email, password: SENHA, remember: false }),
    }),
  );
  expect(res.status).toBe(200);
}

async function loggedOwner() {
  const owner = await newAdmin('OWNER');
  await loginAs(owner.email);
  return owner;
}

async function createOrder(numbers: number[], contributor: Json = {}) {
  seq += 1;
  const res = await criarPedido(
    new Request(`${ORIGIN}/api/pedidos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${seq}` },
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
  it('sem cookie, toda rota responde 401 e nada é alterado', async () => {
    const orderId = await createOrder(range(1, 10));
    await approve(orderId);
    const outro = await newAdmin('ADMIN');

    const responses = await Promise.all([
      metricas(),
      listarPedidos(get('/api/admin/pedidos')),
      detalheDoPedido(get(`/api/admin/pedidos/${orderId}`), withId(orderId)),
      estornar(send('POST', `/api/admin/pedidos/${orderId}/estornar`), withId(orderId)),
      reenviarEmail(send('POST', `/api/admin/pedidos/${orderId}/reenviar-email`), withId(orderId)),
      exportarCsv(get('/api/admin/exportar.csv')),
      listarProdutos(),
      patchProdutos(send('PATCH', '/api/admin/produtos', { id: 'cestas-boticario', active: false })),
      patchProduto(
        send('PATCH', '/api/admin/produtos/cestas-boticario', { active: false }),
        withId('cestas-boticario'),
      ),
      getConfiguracoes(),
      patchConfiguracoes(send('PATCH', '/api/admin/configuracoes', { goalCents: 1 })),
      listarUsuarios(),
      convidar(send('POST', '/api/admin/usuarios', { name: 'Fulano Teste', email: 'fulano@example.com' })),
      patchUsuario(send('PATCH', `/api/admin/usuarios/${outro.id}`, { active: false }), withId(outro.id)),
      reenviarConvite(send('POST', `/api/admin/usuarios/${outro.id}/reenviar-convite`), withId(outro.id)),
      expirar(send('POST', '/api/admin/expirar')),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect((await bodyOf(res)).code).toBe('UNAUTHORIZED');
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('APPROVED');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'cestas-boticario' } })).active).toBe(true);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: 'main' } })).goalCents).toBe(250000);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: outro.id } })).disabledAt).toBeNull();
  });

  it('rota mutável recusa chamada de outra origem (403)', async () => {
    await loggedOwner();
    const semOrigem = await expirar(send('POST', '/api/admin/expirar', undefined, null));
    expect(semOrigem.status).toBe(403);
    const outraOrigem = await patchConfiguracoes(
      send('PATCH', '/api/admin/configuracoes', { goalCents: 1 }, 'https://malicioso.example'),
    );
    expect(outraOrigem.status).toBe(403);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: 'main' } })).goalCents).toBe(250000);
  });

  it('admin com troca de senha pendente não usa o painel (403)', async () => {
    seq += 1;
    const email = `pendente${seq}@teste.local`;
    await createAdmin(prisma, { email, name: 'Pendente', password: SENHA, mustChangePassword: true });
    await loginAs(email);
    const res = await listarPedidos(get('/api/admin/pedidos'));
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
});

describe('pedidos', () => {
  it('lista pagina, filtra e nunca expõe o CPF', async () => {
    await loggedOwner();
    const a = await createOrder(range(1, 10), { name: 'Ana Souza', email: 'ana@example.com' });
    const b = await createOrder(range(101, 20), { name: 'Bruno Lima', email: 'bruno@example.com' });
    const c = await createOrder(range(201, 10), { name: 'Carla Dias', email: 'carla@example.com' });
    await approve(b);

    const page1 = await listarPedidos(get('/api/admin/pedidos?pageSize=2'));
    expect(page1.status).toBe(200);
    const text = await page1.text();
    expect(text).not.toContain('cpfCipher');
    expect(text).not.toContain('rawCreate');
    expect(text).not.toContain(CPF_DIGITOS);
    expect(text).not.toContain(CPF);
    const first = JSON.parse(text) as { items: Json[]; page: number; pageSize: number; total: number };
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(first.items).toHaveLength(2);
    expect((first.items[0].contributor as Json).cpfMasked).toBe('***.***.***-4725');

    const page2 = await bodyOf(await listarPedidos(get('/api/admin/pedidos?pageSize=2&page=2')));
    expect(page2.items).toHaveLength(1);
    const ids = [...first.items, ...(page2.items as Json[])].map((item) => item.id).sort();
    expect(ids).toEqual([a, b, c].sort());

    const padrao = await bodyOf(await listarPedidos(get('/api/admin/pedidos')));
    expect(padrao.pageSize).toBe(20);

    const idsOf = async (query: string) => {
      const body = await bodyOf(await listarPedidos(get(`/api/admin/pedidos?${query}`)));
      return (body.items as Json[]).map((item) => item.id).sort();
    };
    expect(await idsOf('status=APPROVED')).toEqual([b]);
    expect(await idsOf('status=PENDING')).toEqual([a, c].sort());
    expect(await idsOf('mode=EXTRA')).toEqual([]);
    expect(await idsOf('q=bruno')).toEqual([b]);
    expect(await idsOf('q=carla%40example.com')).toEqual([c]);
    expect(await idsOf(`q=${a}`)).toEqual([a]);
    expect(await idsOf('q=205')).toEqual([c]);
    expect(await idsOf('q=1000')).toEqual([b]);
    expect(await idsOf('q=4725')).toEqual([a, b, c].sort());

    const invalido = await listarPedidos(get('/api/admin/pedidos?status=PAGO'));
    expect(invalido.status).toBe(422);
  });

  it('detalhe traz números, cobrança sem a resposta crua e a auditoria', async () => {
    await loggedOwner();
    const orderId = await createOrder(range(1, 10));
    await approve(orderId);

    const res = await detalheDoPedido(get(`/api/admin/pedidos/${orderId}`), withId(orderId));
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const proibido of ['rawCreate', 'cpfCipher', CPF_DIGITOS, CPF]) {
      expect(text).not.toContain(proibido);
    }
    const { order } = JSON.parse(text) as { order: Json };
    expect(order.status).toBe('APPROVED');
    expect(order.numbers).toEqual(range(1, 10));
    expect(order.payment).toBeTruthy();
    expect(Array.isArray(order.audit)).toBe(true);
    expect((order.audit as Json[]).length).toBeGreaterThan(0);

    const inexistente = await detalheDoPedido(get('/api/admin/pedidos/nao-existe'), withId('nao-existe'));
    expect(inexistente.status).toBe(404);
  });

  it('CSV sai como anexo com BOM e sem 11 dígitos seguidos', async () => {
    await loggedOwner();
    const orderId = await createOrder(range(1, 10));
    const comFormula = await createOrder(range(11, 10), { email: 'formula@example.com' });
    // A validação do checkout não deixa esse nome entrar; gravado direto para testar a defesa do CSV.
    await prisma.order.update({
      where: { id: comFormula },
      data: { contributor: { update: { name: '=SOMA(A1) Maria Teste' } } },
    });
    await approve(orderId);

    const res = await exportarCsv(get('/api/admin/exportar.csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="pedidos.csv"');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).slice(1);

    expect(csv).not.toMatch(/\d{11}/);
    expect(csv).not.toContain(CPF);
    expect(csv).not.toContain('cpfCipher');
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].replaceAll('"', '')).toBe(
      'id;data;nome;e-mail;telefone;cpf_mascarado;produto;modo;valor;status;numeros',
    );
    expect(csv).toContain('***.***.***-4725');
    expect(csv).toContain('Maria Teste');
    // Célula que começaria com "=" não pode virar fórmula na planilha.
    expect(csv).not.toContain('"=SOMA');

    const filtrado = await exportarCsv(get('/api/admin/exportar.csv?status=APPROVED'));
    expect((await filtrado.text()).trim().split('\r\n')).toHaveLength(2);
  });

  it('estorno em demo marca REFUNDED, libera os números e fica na auditoria', async () => {
    const owner = await loggedOwner();
    const orderId = await createOrder(range(1, 10));

    const pendente = await estornar(send('POST', `/api/admin/pedidos/${orderId}/estornar`), withId(orderId));
    expect(pendente.status).toBe(409);
    expect((await bodyOf(pendente)).code).toBe('ORDER_NOT_REFUNDABLE');

    await approve(orderId);
    expect(await prisma.orderNumber.count({ where: { orderId, active: true } })).toBe(10);

    const res = await estornar(send('POST', `/api/admin/pedidos/${orderId}/estornar`), withId(orderId));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect((body.order as Json).status).toBe('REFUNDED');
    expect(JSON.stringify(body)).not.toContain('rawCreate');

    const saved = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(saved.status).toBe('REFUNDED');
    expect(saved.refundedAt).toBeInstanceOf(Date);
    expect(await prisma.orderNumber.count({ where: { orderId, active: true } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { target: orderId, actorId: owner.id } })).toBeGreaterThan(0);

    // Os mesmos números voltam a ficar disponíveis para outra pessoa.
    await createOrder(range(1, 10), { email: 'outra@example.com' });

    const repetido = await estornar(send('POST', `/api/admin/pedidos/${orderId}/estornar`), withId(orderId));
    expect(repetido.status).toBe(409);
  });

  it('aprovação envia o e-mail uma vez; o painel reenvia só para pedido aprovado', async () => {
    await loggedOwner();
    const orderId = await createOrder(range(1, 10));

    const antes = await reenviarEmail(
      send('POST', `/api/admin/pedidos/${orderId}/reenviar-email`),
      withId(orderId),
    );
    expect(antes.status).toBe(409);
    expect(mail.sent.filter((item) => item.template === 'pedido-confirmado')).toHaveLength(0);

    await approve(orderId);
    await approve(orderId); // repetir a aprovação não reenvia
    const confirmados = () => mail.sent.filter((item) => item.template === 'pedido-confirmado');
    expect(confirmados()).toHaveLength(1);
    expect(confirmados()[0].to).toBe('maria@example.com');
    expect(String(confirmados()[0].data.linkObrigado)).toContain(`/obrigado/${orderId}?t=`);

    const res = await reenviarEmail(
      send('POST', `/api/admin/pedidos/${orderId}/reenviar-email`),
      withId(orderId),
    );
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ emailSent: true });
    expect(confirmados()).toHaveLength(2);

    // Falha no envio não derruba a rota: o painel recebe `emailSent: false`.
    mail.ok = false;
    const falhou = await reenviarEmail(
      send('POST', `/api/admin/pedidos/${orderId}/reenviar-email`),
      withId(orderId),
    );
    expect(falhou.status).toBe(200);
    expect(await bodyOf(falhou)).toEqual({ emailSent: false });
  });

  it('expirar agora libera os pendentes vencidos', async () => {
    await loggedOwner();
    const orderId = await createOrder(range(1, 10));
    await prisma.order.update({
      where: { id: orderId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await expirar(send('POST', '/api/admin/expirar'));
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ expired: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('EXPIRED');
    expect(await prisma.orderNumber.count({ where: { orderId, active: true } })).toBe(0);
  });

  it('métricas somam só o que foi aprovado', async () => {
    await loggedOwner();
    const pago = await createOrder(range(1, 20));
    await createOrder(range(101, 10));
    await approve(pago);

    const res = await metricas();
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.ordersTotal).toBe(2);
    expect(Array.isArray(body.last7Days)).toBe(true);
    expect(body.last7Days).toHaveLength(7);
    expect(JSON.stringify(body)).toContain('1000');
  });
});

describe('produtos e configurações', () => {
  it('edita o produto; o preço trava depois do primeiro pedido aprovado', async () => {
    await loggedOwner();
    const lista = await bodyOf(await listarProdutos());
    expect((lista.items as Json[]).map((item) => item.id)).toContain('cestas-boticario');

    const titulo = await patchProduto(
      send('PATCH', '/api/admin/produtos/cestas-boticario', { title: 'Cestas novas' }),
      withId('cestas-boticario'),
    );
    expect(titulo.status).toBe(200);
    expect(((await bodyOf(titulo)).product as Json).title).toBe('Cestas novas');

    const pelaColecao = await patchProdutos(
      send('PATCH', '/api/admin/produtos', { id: 'cestas-boticario', active: false }),
    );
    expect(pelaColecao.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'cestas-boticario' } })).active).toBe(
      false,
    );
    await patchProdutos(send('PATCH', '/api/admin/produtos', { id: 'cestas-boticario', active: true }));

    const vazio = await patchProduto(
      send('PATCH', '/api/admin/produtos/cestas-boticario', {}),
      withId('cestas-boticario'),
    );
    expect(vazio.status).toBe(422);

    const orderId = await createOrder(range(1, 10));
    await approve(orderId);
    const preco = await patchProduto(
      send('PATCH', '/api/admin/produtos/cestas-boticario', { unitCents: 75 }),
      withId('cestas-boticario'),
    );
    expect(preco.status).toBe(409);
    expect((await bodyOf(preco)).code).toBe('PRODUCT_PRICE_LOCKED');
  });

  it('configurações rejeitam goalCents negativo e gravam o que é válido', async () => {
    await loggedOwner();

    const atual = await bodyOf(await getConfiguracoes());
    expect((atual.settings as Json).goalCents).toBe(250000);
    expect(atual.gateways).toBeTruthy();

    for (const invalido of [
      { goalCents: -1 },
      { goalCents: 10.5 },
      { costsCents: -5 },
      { drawAt: 'amanhã' },
    ]) {
      const res = await patchConfiguracoes(send('PATCH', '/api/admin/configuracoes', invalido));
      expect(res.status).toBe(422);
      expect((await bodyOf(res)).code).toBe('VALIDATION_ERROR');
    }
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: 'main' } })).goalCents).toBe(250000);

    const longa = await patchConfiguracoes(
      send('PATCH', '/api/admin/configuracoes', { publicMessage: 'x'.repeat(501) }),
    );
    expect(longa.status).toBe(422);

    const ok = await patchConfiguracoes(
      send('PATCH', '/api/admin/configuracoes', {
        goalCents: 300000,
        costsCents: 1500,
        drawAt: '2026-12-20T18:00:00-03:00',
        drawPublic: true,
        publicMessage: 'Obrigado por participar!',
      }),
    );
    expect(ok.status).toBe(200);
    const saved = await prisma.campaign.findUniqueOrThrow({ where: { id: 'main' } });
    expect(saved.goalCents).toBe(300000);
    expect(saved.costsCents).toBe(1500);
    expect(saved.drawAt?.toISOString()).toBe('2026-12-20T21:00:00.000Z');
    expect(saved.drawPublic).toBe(true);

    const semData = await patchConfiguracoes(send('PATCH', '/api/admin/configuracoes', { drawAt: null }));
    expect(semData.status).toBe(200);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: 'main' } })).drawAt).toBeNull();
  });
});

describe('usuários', () => {
  it('lista sem hash de senha e convida por e-mail sem devolver o link', async () => {
    await loggedOwner();

    const res = await convidar(
      send('POST', '/api/admin/usuarios', { name: 'Nova Pessoa', email: 'Nova@Example.com' }),
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.emailSent).toBe(true);
    expect((body.admin as Json).role).toBe('ADMIN');
    const convite = mail.sent.find((item) => item.template === 'convite-admin');
    expect(convite?.to).toBe('nova@example.com');
    // O link só existe no e-mail: nada dele volta na resposta.
    const enviado = JSON.stringify(convite?.data);
    const link = /\/admin\/convite\/([\w-]+)/.exec(enviado)?.[1] ?? 'sem-link';
    expect(link).not.toBe('sem-link');
    expect(JSON.stringify(body)).not.toContain(link);

    const listaRes = await listarUsuarios();
    const texto = await listaRes.text();
    expect(texto).not.toContain('passwordHash');
    expect(texto).not.toContain('tokenHash');
    expect(texto).not.toContain(link);
    const { items } = JSON.parse(texto) as { items: Json[] };
    expect(items).toHaveLength(2);
    const convidado = items.find((item) => item.email === 'nova@example.com');
    expect(convidado?.status).toBe('invited');

    const reenvio = await reenviarConvite(
      send('POST', `/api/admin/usuarios/${String(convidado?.id)}/reenviar-convite`),
      withId(String(convidado?.id)),
    );
    expect(reenvio.status).toBe(200);
    expect(mail.sent.filter((item) => item.template === 'convite-admin')).toHaveLength(2);

    const invalido = await convidar(send('POST', '/api/admin/usuarios', { name: 'X', email: 'nao-e-email' }));
    expect(invalido.status).toBe(422);
  });

  it('ADMIN não desativa OWNER nem convida OWNER (403)', async () => {
    const owner = await newAdmin('OWNER');
    const admin = await newAdmin('ADMIN');
    await loginAs(admin.email);

    const res = await patchUsuario(
      send('PATCH', `/api/admin/usuarios/${owner.id}`, { active: false }),
      withId(owner.id),
    );
    expect(res.status).toBe(403);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } })).disabledAt).toBeNull();

    const outroAdmin = await newAdmin('ADMIN');
    const entreAdmins = await patchUsuario(
      send('PATCH', `/api/admin/usuarios/${outroAdmin.id}`, { active: false }),
      withId(outroAdmin.id),
    );
    expect(entreAdmins.status).toBe(403);

    const convite = await convidar(
      send('POST', '/api/admin/usuarios', { name: 'Outro Dono', email: 'dono@example.com', role: 'OWNER' }),
    );
    expect(convite.status).toBe(403);
    expect(mail.sent).toHaveLength(0);
  });

  it('OWNER desativa ADMIN, que perde a sessão na hora; depois reativa', async () => {
    const owner = await newAdmin('OWNER');
    const admin = await newAdmin('ADMIN');

    await loginAs(admin.email);
    const cookieDoAdmin = new Map(jar.store);
    expect((await listarPedidos(get('/api/admin/pedidos'))).status).toBe(200);

    await loginAs(owner.email);
    const cookieDoOwner = new Map(jar.store);
    const res = await patchUsuario(
      send('PATCH', `/api/admin/usuarios/${admin.id}`, { active: false }),
      withId(admin.id),
    );
    expect(res.status).toBe(200);
    expect(((await bodyOf(res)).admin as Json).status).toBe('disabled');
    expect(await prisma.session.count({ where: { userId: admin.id } })).toBe(0);

    jar.store = cookieDoAdmin;
    expect((await listarPedidos(get('/api/admin/pedidos'))).status).toBe(401);

    jar.store = cookieDoOwner;
    const volta = await patchUsuario(
      send('PATCH', `/api/admin/usuarios/${admin.id}`, { active: true }),
      withId(admin.id),
    );
    expect(volta.status).toBe(200);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })).disabledAt).toBeNull();
  });

  it('o último OWNER ativo não pode ser desativado', async () => {
    const owner = await loggedOwner();

    // Pela rota, o único OWNER só alcança a si mesmo: recusado.
    const proprio = await patchUsuario(
      send('PATCH', `/api/admin/usuarios/${owner.id}`, { active: false }),
      withId(owner.id),
    );
    expect(proprio.status).toBe(409);
    expect((await bodyOf(proprio)).code).toBe('CANNOT_DEACTIVATE_SELF');

    // Com dois OWNERs, um desativa o outro...
    const segundo = await newAdmin('OWNER');
    const ok = await patchUsuario(
      send('PATCH', `/api/admin/usuarios/${segundo.id}`, { active: false }),
      withId(segundo.id),
    );
    expect(ok.status).toBe(200);

    // ...mas quem já foi desativado (pedido que chegou atrasado) não derruba o que sobrou.
    const tentativa = deactivateAdmin(owner.id, { id: segundo.id, role: 'OWNER' });
    await expect(tentativa).rejects.toBeInstanceOf(AppError);
    await expect(tentativa).rejects.toMatchObject({ code: 'LAST_OWNER', status: 409 });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } })).disabledAt).toBeNull();
  });
});
