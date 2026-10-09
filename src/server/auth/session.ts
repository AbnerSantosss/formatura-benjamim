import 'server-only';
import { cookies } from 'next/headers';
import type { AdminRole } from '@prisma/client';
import { randomToken, sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { env } from '@/server/env';

/** Nome do cookie de sessão do painel. `src/proxy.ts` repete o literal porque não pode importar este módulo. */
export const SESSION_COOKIE = 'bj_admin';

const HOUR_MS = 60 * 60 * 1000;
export const SESSION_TTL_MS = 12 * HOUR_MS;
export const SESSION_REMEMBER_TTL_MS = 30 * 24 * HOUR_MS;

export type SessionAdmin = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  mustChangePassword: boolean;
};

export type AuthContext = {
  admin: SessionAdmin;
  session: { id: string; expiresAt: Date; remember: boolean };
};

/**
 * Cria a sessão no banco. Só o sha256 do token é gravado; o valor em claro (`raw`) existe
 * apenas no retorno, para ir ao cookie.
 *
 * `ctx` (ip, userAgent) faz parte da assinatura do plano, mas a tabela `Session` não tem
 * colunas para esses dados, então nada deles é persistido.
 */
export async function createSession(
  adminId: string,
  remember: boolean,
  ctx: { ip?: string; userAgent?: string } = {},
): Promise<{ raw: string; expiresAt: Date }> {
  void ctx;
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + (remember ? SESSION_REMEMBER_TTL_MS : SESSION_TTL_MS));
  await prisma.session.create({
    data: { tokenHash: token.hash, userId: adminId, remember, expiresAt },
  });
  return { raw: token.raw, expiresAt };
}

export async function setSessionCookie(raw: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Sessão válida = cookie presente, sessão não expirada, admin ativo (sem `disabledAt`) e com
 * senha definida. Qualquer outra situação devolve `null`.
 */
export async function getSession(): Promise<AuthContext | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(raw) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const { user } = session;
  if (user.disabledAt !== null || user.passwordHash === null) return null;

  return {
    admin: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    session: { id: session.id, expiresAt: session.expiresAt, remember: session.remember },
  };
}

/** Apaga a sessão do banco (se houver) e o cookie. Só pode ser chamada em Route Handler ou Server Function. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(raw) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}
