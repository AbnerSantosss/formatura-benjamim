import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// Nenhum e-mail real. O `.env.test` não tem SMTP, mas o Prisma Client, ao ser criado, carrega o
// `.env` local para `process.env` (sem sobrescrever o que já existe); se `@/server/env` for
// avaliado depois disso, ele enxerga o SMTP de verdade. Duas travas:
// 1) as variáveis SMTP_* ficam definidas e vazias, então o `.env` não consegue preenchê-las;
// 2) o transporte é trocado por um `jsonTransport` fixo, que nunca abre conexão.
vi.hoisted(() => {
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_REPLY_TO']) {
    process.env[key] = '';
  }
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
});

vi.mock('@/server/email/transport', async () => {
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({ jsonTransport: true });
  return {
    EMAIL_TIMEOUT_MS: 20_000,
    emailMode: () => 'console',
    getTransport: () => transporter,
  };
});

// `cookies()` do Next só existe dentro de uma requisição. Aqui vira um pote em memória.
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

// `after()` também só existe dentro de uma requisição: aqui o trabalho roda na hora e a
// promessa fica guardada para o teste esperar (`flushAfter`).
const deferred = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.pending.push(Promise.resolve().then(task));
  },
}));

import { POST as aceitarConvite } from '@/app/api/admin/auth/aceitar-convite/route';
import { POST as esqueciSenha } from '@/app/api/admin/auth/esqueci-senha/route';
import { POST as login } from '@/app/api/admin/auth/login/route';
import { GET as me } from '@/app/api/admin/auth/me/route';
import { POST as redefinir } from '@/app/api/admin/auth/redefinir/route';
import { GET as conferirToken } from '@/app/api/admin/auth/token/[token]/route';
import { inviteAdmin, resendInvite } from '@/server/auth/invites';
import { requireAdmin } from '@/server/auth/require-admin';
import { consumeToken, issueToken, peekToken } from '@/server/auth/tokens';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { getTransport } from '@/server/email/transport';
import { env } from '@/server/env';
import { createAdmin } from '../../scripts/admin-create';

const SENHA_DONO = 'senha-do-dono-123';
const SENHA_CONVIDADA = 'convidada-teste-456';
const SENHA_NOVA = 'redefinida-teste-789';
const ORIGIN = new URL(env.NEXT_PUBLIC_SITE_URL).origin;

// Sufixo por execução: outra execução da suíte no mesmo banco não colide com estes e-mails.
const RUN = Math.random().toString(36).slice(2, 8);

let seq = 0;
let ip = '';
let ownerEmail = '';
let guestEmail = '';
let owner: { id: string; name: string };
let sendMail: MockInstance;

function post(pathname: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(new URL(pathname, env.NEXT_PUBLIC_SITE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': ip, ...headers },
    body: JSON.stringify(body),
  });
}

function conferir(token: string, kind: string, headers: Record<string, string> = {}) {
  const req = new Request(
    new URL(`/api/admin/auth/token/${encodeURIComponent(token)}?kind=${kind}`, env.NEXT_PUBLIC_SITE_URL),
    // GET de mesma origem não manda `Origin`; o navegador manda `Referer`.
    { headers: { referer: `${ORIGIN}/admin/convite/x`, 'x-forwarded-for': ip, ...headers } },
  );
  return conferirToken(req, { params: Promise.resolve({ token }) });
}

async function flushAfter(): Promise<void> {
  await Promise.all(deferred.pending.splice(0));
}

/** Lê os e-mails "enviados" pelo jsonTransport: destinatário e texto, como chegariam na caixa. */
async function sentEmails(): Promise<{ to: string; subject: string; text: string }[]> {
  await flushAfter();
  const out: { to: string; subject: string; text: string }[] = [];
  for (const result of sendMail.mock.results) {
    const info = (await result.value) as { message: string };
    const message = JSON.parse(info.message) as {
      to: { address: string }[];
      subject: string;
      text: string;
    };
    out.push({ to: message.to[0].address, subject: message.subject, text: message.text });
  }
  return out;
}

/** O token só existe no link do e-mail: é de lá que o teste o tira. */
function tokenFromLink(text: string, page: 'convite' | 'redefinir'): string {
  const match = text.match(new RegExp(`${ORIGIN}/admin/${page}/([A-Za-z0-9_-]+)`));
  if (!match) throw new Error(`link de ${page} não encontrado no e-mail`);
  return match[1];
}

async function convidar(role: 'ADMIN' | 'OWNER' = 'ADMIN') {
  const result = await inviteAdmin({ name: 'Convidada', email: guestEmail, role }, owner);
  const emails = await sentEmails();
  const raw = tokenFromLink(emails[emails.length - 1].text, 'convite');
  return { result, raw };
}

function aceitar(token: string, extra: { name?: string; password?: string } = {}) {
  return aceitarConvite(
    post('/api/admin/auth/aceitar-convite', {
      token,
      name: extra.name ?? 'Convidada Silva',
      password: extra.password ?? SENHA_CONVIDADA,
    }),
  );
}

beforeEach(async () => {
  // E-mails e IP novos a cada teste: o limite de tentativas vive na memória do processo.
  seq += 1;
  ip = `10.1.0.${seq}`;
  ownerEmail = `dono${seq}-${RUN}@fluxos.local`;
  guestEmail = `convidada${seq}-${RUN}@fluxos.local`;
  jar.store.clear();
  deferred.pending.length = 0;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  sendMail = vi.spyOn(getTransport(), 'sendMail');

  const created = await createAdmin(prisma, {
    email: ownerEmail,
    name: 'Dono de Teste',
    password: SENHA_DONO,
    mustChangePassword: false,
  });
  expect(created.status).toBe('created');
  const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: ownerEmail } });
  owner = { id: user.id, name: user.name };
});

afterEach(async () => {
  await flushAfter();
  vi.restoreAllMocks();
});

describe('tokens (src/server/auth/tokens.ts)', () => {
  it('guarda só o hash; peek não consome; consume é de uso único e respeita o tipo', async () => {
    const raw = await issueToken(owner.id, 'RESET', 60_000);
    const rows = await prisma.authToken.findMany({ where: { userId: owner.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256Hex(raw));
    expect(rows[0].tokenHash).not.toBe(raw);

    await expect(peekToken(raw, 'RESET')).resolves.toBe(owner.id);
    await expect(peekToken(raw, 'RESET')).resolves.toBe(owner.id);
    await expect(peekToken(raw, 'INVITE')).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: 400 });
    await expect(consumeToken(raw, 'INVITE')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });

    await expect(consumeToken(raw, 'RESET')).resolves.toBe(owner.id);
    await expect(consumeToken(raw, 'RESET')).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
      status: 400,
      message: 'Link inválido ou expirado.',
    });
    await expect(peekToken(raw, 'RESET')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    await expect(peekToken('nao-existe', 'RESET')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('emitir de novo invalida o anterior do mesmo tipo, sem tocar no de outro tipo', async () => {
    const reset1 = await issueToken(owner.id, 'RESET', 60_000);
    const invite = await issueToken(owner.id, 'INVITE', 60_000);
    const reset2 = await issueToken(owner.id, 'RESET', 60_000);

    await expect(peekToken(reset1, 'RESET')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    await expect(peekToken(reset2, 'RESET')).resolves.toBe(owner.id);
    await expect(peekToken(invite, 'INVITE')).resolves.toBe(owner.id);
  });

  it('duas tentativas simultâneas com o mesmo token: só uma passa', async () => {
    const raw = await issueToken(owner.id, 'RESET', 60_000);
    const results = await Promise.allSettled([consumeToken(raw, 'RESET'), consumeToken(raw, 'RESET')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('convite de admin', () => {
  it('convite → conferir link → aceitar → sessão válida', async () => {
    const { result, raw } = await convidar();
    expect(result.emailSent).toBe(true);
    expect(result.admin).toMatchObject({ email: guestEmail, name: 'Convidada', role: 'ADMIN' });
    // O token não volta para quem convidou: só vai no e-mail.
    expect(JSON.stringify(result)).not.toContain(raw);

    const emails = await sentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(guestEmail);
    expect(emails[0].text).toContain('Dono de Teste convidou você');

    const pendente = await prisma.adminUser.findUniqueOrThrow({ where: { email: guestEmail } });
    expect(pendente.passwordHash).toBeNull();
    expect(pendente.invitedById).toBe(owner.id);
    expect(pendente.invitedAt).toBeInstanceOf(Date);
    expect(pendente.acceptedAt).toBeNull();

    const conferido = await conferir(raw, 'INVITE');
    expect(conferido.status).toBe(200);
    expect(await conferido.json()).toEqual({ valid: true, name: 'Convidada', email: guestEmail });
    // Conferir não consome, e o link de convite não serve como link de redefinição.
    expect(await (await conferir(raw, 'RESET')).json()).toEqual({ valid: false });

    const res = await aceitar(raw);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toMatchObject({
      email: guestEmail,
      name: 'Convidada Silva',
      role: 'ADMIN',
      mustChangePassword: false,
    });
    expect(JSON.stringify(body)).not.toContain(raw);
    expect(body.admin.passwordHash).toBeUndefined();

    const cookie = jar.store.get('bj_admin');
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    const sessions = await prisma.session.findMany({ where: { userId: pendente.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].remember).toBe(false);
    expect(sessions[0].tokenHash).toBe(sha256Hex(cookie!.value));

    const auth = await requireAdmin();
    expect(auth.admin).toMatchObject({ email: guestEmail, name: 'Convidada Silva' });
    expect((await me()).status).toBe(200);

    const aceito = await prisma.adminUser.findUniqueOrThrow({ where: { email: guestEmail } });
    expect(aceito.acceptedAt).toBeInstanceOf(Date);
    expect(aceito.passwordHash).toMatch(/^\$2[aby]\$12\$/);

    // Entra com a senha escolhida.
    jar.store.clear();
    const entrou = await login(
      post('/api/admin/auth/login', { email: guestEmail, password: SENHA_CONVIDADA }),
    );
    expect(entrou.status).toBe(200);

    const acoes = await prisma.auditLog.findMany({
      where: {
        action: { in: ['admin.invited', 'admin.invite_accepted'] },
        actorId: { in: [owner.id, pendente.id] },
      },
      select: { action: true, actorId: true, meta: true },
    });
    expect(acoes).toHaveLength(2);
    expect(acoes.find((log) => log.action === 'admin.invited')?.actorId).toBe(owner.id);
    expect(acoes.find((log) => log.action === 'admin.invite_accepted')?.actorId).toBe(pendente.id);
    // Auditoria sem e-mail nem token.
    const auditoria = JSON.stringify(acoes);
    expect(auditoria).not.toContain(guestEmail);
    expect(auditoria).not.toContain(raw);
  });

  it('aceitar duas vezes falha', async () => {
    const { raw } = await convidar();
    expect((await aceitar(raw)).status).toBe(200);

    jar.store.clear();
    const segunda = await aceitar(raw, { password: 'outra-senha-999' });
    expect(segunda.status).toBe(400);
    expect(await segunda.json()).toEqual({ code: 'TOKEN_INVALID', message: 'Link inválido ou expirado.' });
    expect(jar.store.has('bj_admin')).toBe(false);
    expect(await (await conferir(raw, 'INVITE')).json()).toEqual({ valid: false });

    // A senha da primeira aceitação continua valendo.
    const entrou = await login(
      post('/api/admin/auth/login', { email: guestEmail, password: SENHA_CONVIDADA }),
    );
    expect(entrou.status).toBe(200);
  });

  it('token expirado falha', async () => {
    const { raw } = await convidar();
    await prisma.authToken.updateMany({
      where: { tokenHash: sha256Hex(raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await (await conferir(raw, 'INVITE')).json()).toEqual({ valid: false });
    const res = await aceitar(raw);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TOKEN_INVALID');
    expect(jar.store.has('bj_admin')).toBe(false);
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: guestEmail } });
    expect(user.passwordHash).toBeNull();
  });

  it('o convite vale 7 dias', async () => {
    const { raw } = await convidar();
    const token = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: sha256Hex(raw) } });
    const dias = (token.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThan(7.01);
  });

  it('admin desativado não aceita convite (403) e o link aparece como inválido', async () => {
    const { raw } = await convidar();
    await prisma.adminUser.update({ where: { email: guestEmail }, data: { disabledAt: new Date() } });

    expect(await (await conferir(raw, 'INVITE')).json()).toEqual({ valid: false });
    const res = await aceitar(raw);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ACCOUNT_DISABLED');
    expect(jar.store.has('bj_admin')).toBe(false);
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: guestEmail } });
    expect(user.passwordHash).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('senha fraca devolve 422 e não gasta o convite', async () => {
    const { raw } = await convidar();
    const fraca = await aceitar(raw, { password: 'curta1' });
    expect(fraca.status).toBe(422);
    expect(jar.store.has('bj_admin')).toBe(false);
    expect((await aceitar(raw)).status).toBe(200);
  });

  it('convidar quem já é administrador ativo com senha devolve 409 e não envia e-mail', async () => {
    await expect(
      inviteAdmin({ name: 'Dono', email: ownerEmail.toUpperCase(), role: 'ADMIN' }, owner),
    ).rejects.toMatchObject({ status: 409, message: 'Já é administrador.' });
    expect(await sentEmails()).toHaveLength(0);
    const dono = await prisma.adminUser.findUniqueOrThrow({ where: { email: ownerEmail } });
    expect(dono.role).toBe('OWNER');
    expect(dono.name).toBe('Dono de Teste');
  });

  it('reenviar o convite gera link novo e invalida o anterior', async () => {
    const { result, raw: primeiro } = await convidar();
    const reenvio = await resendInvite(result.admin.id, owner);
    expect(reenvio.emailSent).toBe(true);

    const emails = await sentEmails();
    expect(emails).toHaveLength(2);
    const segundo = tokenFromLink(emails[1].text, 'convite');
    expect(segundo).not.toBe(primeiro);

    expect((await aceitar(primeiro)).status).toBe(400);
    expect((await aceitar(segundo)).status).toBe(200);

    // Depois de aceito não há o que reenviar.
    await expect(resendInvite(result.admin.id, owner)).rejects.toMatchObject({ status: 409 });
    await expect(resendInvite('nao-existe', owner)).rejects.toMatchObject({ status: 404 });
  });

  it('convidar de novo quem ainda não aceitou atualiza o cadastro em vez de duplicar', async () => {
    const { raw: primeiro } = await convidar('ADMIN');
    const { result, raw: segundo } = await convidar('OWNER');
    expect(result.admin.role).toBe('OWNER');
    expect(await prisma.adminUser.count({ where: { email: guestEmail } })).toBe(1);
    expect(await (await conferir(primeiro, 'INVITE')).json()).toEqual({ valid: false });
    expect((await (await conferir(segundo, 'INVITE')).json()).valid).toBe(true);
  });
});

describe('esqueci minha senha e redefinição', () => {
  it('e-mail inexistente responde 200 sem enviar nada', async () => {
    const res = await esqueciSenha(
      post('/api/admin/auth/esqueci-senha', { email: `ninguem${seq}-${RUN}@fluxos.local` }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await sentEmails()).toHaveLength(0);
    expect(await prisma.authToken.count({ where: { kind: 'RESET', userId: owner.id } })).toBe(0);
  });

  it('convite pendente (sem senha) e admin desativado: mesma resposta, nenhum e-mail', async () => {
    await convidar();
    sendMail.mockClear();
    const pendente = await esqueciSenha(post('/api/admin/auth/esqueci-senha', { email: guestEmail }));
    expect(pendente.status).toBe(200);
    expect(await pendente.json()).toEqual({ ok: true });

    await prisma.adminUser.update({ where: { email: ownerEmail }, data: { disabledAt: new Date() } });
    const desativado = await esqueciSenha(post('/api/admin/auth/esqueci-senha', { email: ownerEmail }));
    expect(desativado.status).toBe(200);
    expect(await desativado.json()).toEqual({ ok: true });

    expect(await sentEmails()).toHaveLength(0);
    expect(
      await prisma.authToken.count({
        where: { kind: 'RESET', user: { email: { in: [guestEmail, ownerEmail] } } },
      }),
    ).toBe(0);
  });

  it('e-mail existente: mesma resposta, sem token no corpo, link de 1 hora por e-mail', async () => {
    const res = await esqueciSenha(
      post('/api/admin/auth/esqueci-senha', { email: `  ${ownerEmail.toUpperCase()} ` }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: true });

    const emails = await sentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(ownerEmail);
    const raw = tokenFromLink(emails[0].text, 'redefinir');
    expect(body).not.toContain(raw);

    const token = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: sha256Hex(raw) } });
    expect(token.kind).toBe('RESET');
    const minutos = (token.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(59);
    expect(minutos).toBeLessThan(61);

    const conferido = await conferir(raw, 'RESET');
    expect(await conferido.json()).toEqual({ valid: true, name: 'Dono de Teste', email: ownerEmail });
    expect(conferido.headers.get('cache-control')).toBe('no-store');
  });

  it('redefinir troca a senha, derruba as sessões antigas e o link não serve duas vezes', async () => {
    // Duas sessões abertas (dois aparelhos) com a senha antiga.
    expect(
      (await login(post('/api/admin/auth/login', { email: ownerEmail, password: SENHA_DONO }))).status,
    ).toBe(200);
    const aparelho1 = jar.store.get('bj_admin')!;
    jar.store.clear();
    expect(
      (await login(post('/api/admin/auth/login', { email: ownerEmail, password: SENHA_DONO }))).status,
    ).toBe(200);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(2);
    await prisma.adminUser.update({ where: { id: owner.id }, data: { mustChangePassword: true } });

    await esqueciSenha(post('/api/admin/auth/esqueci-senha', { email: ownerEmail }));
    const emails = await sentEmails();
    const raw = tokenFromLink(emails[emails.length - 1].text, 'redefinir');

    // Senha fraca não gasta o link.
    const fraca = await redefinir(post('/api/admin/auth/redefinir', { token: raw, password: 'curta1' }));
    expect(fraca.status).toBe(422);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(2);

    const res = await redefinir(post('/api/admin/auth/redefinir', { token: raw, password: SENHA_NOVA }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
    expect((await me()).status).toBe(401);
    jar.store.set('bj_admin', aparelho1);
    expect((await me()).status).toBe(401);
    jar.store.clear();

    const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } });
    expect(user.mustChangePassword).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'auth.password_reset', actorId: owner.id } })).toBe(
      1,
    );

    const repetida = await redefinir(
      post('/api/admin/auth/redefinir', { token: raw, password: 'mais-uma-senha-321' }),
    );
    expect(repetida.status).toBe(400);
    expect((await repetida.json()).code).toBe('TOKEN_INVALID');

    expect(
      (await login(post('/api/admin/auth/login', { email: ownerEmail, password: SENHA_DONO }))).status,
    ).toBe(401);
    const entrou = await login(post('/api/admin/auth/login', { email: ownerEmail, password: SENHA_NOVA }));
    expect(entrou.status).toBe(200);
    expect((await entrou.json()).admin.mustChangePassword).toBe(false);
  });

  it('link de redefinição expirado ou inventado falha com 400', async () => {
    await esqueciSenha(post('/api/admin/auth/esqueci-senha', { email: ownerEmail }));
    const raw = tokenFromLink((await sentEmails())[0].text, 'redefinir');
    await prisma.authToken.updateMany({
      where: { tokenHash: sha256Hex(raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expirado = await redefinir(post('/api/admin/auth/redefinir', { token: raw, password: SENHA_NOVA }));
    expect(expirado.status).toBe(400);
    const inventado = await redefinir(
      post('/api/admin/auth/redefinir', { token: 'token-que-nao-existe', password: SENHA_NOVA }),
    );
    expect(inventado.status).toBe(400);
    expect(
      (await login(post('/api/admin/auth/login', { email: ownerEmail, password: SENHA_DONO }))).status,
    ).toBe(200);
  });
});

describe('proteções das rotas', () => {
  it('recusam origem diferente do site (CSRF)', async () => {
    const outra = { origin: 'https://malicioso.exemplo' };
    const respostas = await Promise.all([
      esqueciSenha(post('/api/admin/auth/esqueci-senha', { email: ownerEmail }, outra)),
      redefinir(post('/api/admin/auth/redefinir', { token: 'x', password: SENHA_NOVA }, outra)),
      aceitarConvite(
        post('/api/admin/auth/aceitar-convite', { token: 'x', name: 'Fulana', password: SENHA_NOVA }, outra),
      ),
      conferir('x', 'INVITE', { referer: 'https://malicioso.exemplo/pagina' }),
    ]);
    expect(respostas.map((res) => res.status)).toEqual([403, 403, 403, 403]);
    expect(await sentEmails()).toHaveLength(0);
  });

  it('6ª chamada do mesmo IP em 15 minutos devolve 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await redefinir(
        post('/api/admin/auth/redefinir', { token: `x${i}`, password: SENHA_NOVA }),
      );
      expect(res.status).toBe(400);
    }
    const sexta = await redefinir(post('/api/admin/auth/redefinir', { token: 'x', password: SENHA_NOVA }));
    expect(sexta.status).toBe(429);
    expect(Number(sexta.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await sexta.json()).code).toBe('RATE_LIMITED');
  });

  it('conferir link com tipo desconhecido ou token inventado devolve { valid: false }, nunca 500', async () => {
    for (const [token, kind] of [
      ['qualquer-coisa', 'INVITE'],
      ['qualquer-coisa', 'RESET'],
      ['qualquer-coisa', 'OUTRO'],
    ]) {
      const res = await conferir(token, kind);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ valid: false });
    }
  });
});
