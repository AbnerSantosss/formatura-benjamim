import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { POST as login } from '@/app/api/admin/auth/login/route';
import { POST as logout } from '@/app/api/admin/auth/logout/route';
import { GET as me } from '@/app/api/admin/auth/me/route';
import { POST as trocarSenha } from '@/app/api/admin/auth/trocar-senha/route';
import { requireAdmin } from '@/server/auth/require-admin';
import { sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { createAdmin } from '../../scripts/admin-create';

const SENHA_TEMPORARIA = 'temporaria-teste-123';
const SENHA_NOVA = 'definitiva-teste-456';

let seq = 0;
let email = '';
let ip = '';

function post(pathname: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(new URL(pathname, env.NEXT_PUBLIC_SITE_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(env.NEXT_PUBLIC_SITE_URL).origin,
      'x-forwarded-for': ip,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function doLogin(password: string, extra: { remember?: boolean; email?: string } = {}) {
  return login(
    post('/api/admin/auth/login', {
      email: extra.email ?? email,
      password,
      remember: extra.remember ?? false,
    }),
  );
}

beforeEach(async () => {
  // E-mail e IP novos a cada teste: o limite de tentativas vive na memória do processo.
  seq += 1;
  email = `admin${seq}@teste.local`;
  ip = `10.0.0.${seq}`;
  jar.store.clear();
  await createAdmin(prisma, {
    email,
    name: 'Admin de Teste',
    password: SENHA_TEMPORARIA,
    mustChangePassword: true,
  });
});

describe('createAdmin (scripts/admin-create.ts)', () => {
  it('cria OWNER com hash, acceptedAt e troca de senha pendente', async () => {
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe('OWNER');
    expect(user.mustChangePassword).toBe(true);
    expect(user.acceptedAt).toBeInstanceOf(Date);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain(SENHA_TEMPORARIA);
  });

  it('não sobrescreve a senha de quem já tem acceptedAt sem force', async () => {
    const antes = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
    const kept = await createAdmin(prisma, {
      email: email.toUpperCase(),
      name: 'Outro Nome',
      password: SENHA_NOVA,
      mustChangePassword: true,
    });
    expect(kept.status).toBe('kept');
    const depois = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
    expect(depois.passwordHash).toBe(antes.passwordHash);
    expect(depois.name).toBe('Admin de Teste');

    const forced = await createAdmin(prisma, {
      email,
      name: 'Admin de Teste',
      password: SENHA_NOVA,
      mustChangePassword: true,
      force: true,
    });
    expect(forced.status).toBe('updated');
    const forcado = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
    expect(forcado.passwordHash).not.toBe(antes.passwordHash);
  });

  it('recusa senha fora da política', async () => {
    await expect(
      createAdmin(prisma, {
        email: 'x@teste.local',
        name: 'Xis',
        password: 'curta1',
        mustChangePassword: true,
      }),
    ).rejects.toThrow(/10 caracteres/);
  });
});

describe('POST /api/admin/auth/login', () => {
  it('login OK devolve cookie bj_admin HttpOnly e mustChangePassword: true', async () => {
    const res = await doLogin(SENHA_TEMPORARIA);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toMatchObject({ email, role: 'OWNER', mustChangePassword: true });
    expect(body.admin.passwordHash).toBeUndefined();

    const cookie = jar.store.get('bj_admin');
    expect(cookie).toBeDefined();
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });

    // No banco fica só o sha256 do valor do cookie, nunca o token em claro.
    const sessions = await prisma.session.findMany({ where: { user: { email } } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(sha256Hex(cookie!.value));
    expect(sessions[0].tokenHash).not.toBe(cookie!.value);

    // Sem "lembrar": cerca de 12 horas.
    const horas = (sessions[0].expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(11.9);
    expect(horas).toBeLessThan(12.1);

    const log = await prisma.auditLog.findFirst({ where: { action: 'auth.login', actorId: body.admin.id } });
    expect(log).not.toBeNull();
  });

  it('sessão com remember expira em cerca de 30 dias', async () => {
    const res = await doLogin(SENHA_TEMPORARIA, { remember: true });
    expect(res.status).toBe(200);
    const session = await prisma.session.findFirstOrThrow({ where: { user: { email } } });
    expect(session.remember).toBe(true);
    const dias = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);
    const expires = jar.store.get('bj_admin')?.options?.expires as Date;
    expect(expires.getTime()).toBe(session.expiresAt.getTime());
  });

  it('aceita o e-mail com maiúsculas e espaços', async () => {
    const res = await doLogin(SENHA_TEMPORARIA, { email: `  ${email.toUpperCase()} ` });
    expect(res.status).toBe(200);
  });

  it('senha errada devolve 401 sem cookie', async () => {
    const res = await doLogin('senha-errada-999');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
    expect(jar.store.has('bj_admin')).toBe(false);
  });

  it('e-mail inexistente devolve a mesma resposta de senha errada', async () => {
    const res = await doLogin(SENHA_TEMPORARIA, { email: `ninguem${seq}@teste.local` });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
  });

  it('admin desativado devolve 403', async () => {
    await prisma.adminUser.update({ where: { email }, data: { disabledAt: new Date() } });
    const res = await doLogin(SENHA_TEMPORARIA);
    expect(res.status).toBe(403);
    expect(jar.store.has('bj_admin')).toBe(false);
  });

  it('6ª tentativa em 15 minutos devolve 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await doLogin('senha-errada-999');
      expect(res.status).toBe(401);
    }
    const sexta = await doLogin(SENHA_TEMPORARIA);
    expect(sexta.status).toBe(429);
    expect(Number(sexta.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await sexta.json()).code).toBe('RATE_LIMITED');
  });

  it('recusa origem diferente do site (CSRF)', async () => {
    const res = await login(
      post(
        '/api/admin/auth/login',
        { email, password: SENHA_TEMPORARIA },
        { origin: 'https://malicioso.exemplo' },
      ),
    );
    expect(res.status).toBe(403);
    expect(jar.store.has('bj_admin')).toBe(false);
  });
});

describe('sessão, troca de senha obrigatória e logout', () => {
  it('me: 401 sem cookie e 200 com cookie', async () => {
    const semCookie = await me();
    expect(semCookie.status).toBe(401);

    await doLogin(SENHA_TEMPORARIA);
    const comCookie = await me();
    expect(comCookie.status).toBe(200);
    expect((await comCookie.json()).admin).toMatchObject({ email, mustChangePassword: true });
  });

  it('requireAdmin lança PASSWORD_CHANGE_REQUIRED até trocar a senha; trocar-senha libera', async () => {
    await doLogin(SENHA_TEMPORARIA);
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED', status: 403 });
    await expect(requireAdmin({ allowPasswordChangePending: true })).resolves.toMatchObject({
      admin: { email },
    });

    // Outra sessão do mesmo usuário (outro aparelho), que deve ser revogada na troca.
    const atual = jar.store.get('bj_admin')!;
    jar.store.clear();
    await doLogin(SENHA_TEMPORARIA);
    const outroAparelho = jar.store.get('bj_admin')!;
    jar.store.set('bj_admin', atual);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(2);

    const errada = await trocarSenha(
      post('/api/admin/auth/trocar-senha', { currentPassword: 'nao-e-a-atual-1', newPassword: SENHA_NOVA }),
    );
    expect(errada.status).toBe(400);

    const fraca = await trocarSenha(
      post('/api/admin/auth/trocar-senha', { currentPassword: SENHA_TEMPORARIA, newPassword: 'curta1' }),
    );
    expect(fraca.status).toBe(422);
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

    const ok = await trocarSenha(
      post('/api/admin/auth/trocar-senha', { currentPassword: SENHA_TEMPORARIA, newPassword: SENHA_NOVA }),
    );
    expect(ok.status).toBe(200);

    const auth = await requireAdmin();
    expect(auth.admin.mustChangePassword).toBe(false);
    await expect(requireAdmin({ role: 'OWNER' })).resolves.toBeTruthy();

    // A sessão atual continua; a do outro aparelho foi apagada.
    const restantes = await prisma.session.findMany({ where: { user: { email } } });
    expect(restantes.map((s) => s.tokenHash)).toEqual([sha256Hex(atual.value)]);
    jar.store.set('bj_admin', outroAparelho);
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });

    // A senha antiga deixa de valer; a nova entra sem troca pendente.
    jar.store.clear();
    expect((await doLogin(SENHA_TEMPORARIA)).status).toBe(401);
    const novoLogin = await doLogin(SENHA_NOVA);
    expect(novoLogin.status).toBe(200);
    expect((await novoLogin.json()).admin.mustChangePassword).toBe(false);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'auth.password_changed', actorId: auth.admin.id },
    });
    expect(log).not.toBeNull();
  });

  it('trocar-senha sem sessão devolve 401', async () => {
    const res = await trocarSenha(
      post('/api/admin/auth/trocar-senha', { currentPassword: SENHA_TEMPORARIA, newPassword: SENHA_NOVA }),
    );
    expect(res.status).toBe(401);
  });

  it('requireAdmin({ role: OWNER }) recusa ADMIN comum', async () => {
    await prisma.adminUser.update({ where: { email }, data: { role: 'ADMIN', mustChangePassword: false } });
    await doLogin(SENHA_TEMPORARIA);
    await expect(requireAdmin()).resolves.toBeTruthy();
    await expect(requireAdmin({ role: 'OWNER' })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('sessão expirada ou de admin desativado não vale', async () => {
    await doLogin(SENHA_TEMPORARIA);
    await prisma.session.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await me()).status).toBe(401);

    await prisma.session.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    expect((await me()).status).toBe(200);
    await prisma.adminUser.update({ where: { email }, data: { disabledAt: new Date() } });
    expect((await me()).status).toBe(401);
  });

  it('logout apaga a sessão e o cookie', async () => {
    await doLogin(SENHA_TEMPORARIA);
    const cookie = jar.store.get('bj_admin')!;
    expect((await me()).status).toBe(200);

    const res = await logout(post('/api/admin/auth/logout', {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(jar.store.has('bj_admin')).toBe(false);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);

    // Mesmo reapresentando o cookie antigo, a sessão não existe mais.
    jar.store.set('bj_admin', cookie);
    expect((await me()).status).toBe(401);
  });
});
