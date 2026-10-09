import 'server-only';
import type { Prisma, TokenKind } from '@prisma/client';
import { randomToken, sha256Hex } from '@/server/crypto';
import { prisma } from '@/server/db';
import { AppError } from '@/server/errors';

/**
 * Tokens de uso único do painel: convite (`INVITE`) e redefinição de senha (`RESET`).
 *
 * O valor em claro (`raw`) só existe no retorno de `issueToken`, para ir ao link do e-mail.
 * No banco fica apenas o sha256. Nunca logar nem devolver o `raw` em resposta de rota.
 */

const HOUR_MS = 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * HOUR_MS;
export const RESET_TTL_MS = HOUR_MS;

type Db = Prisma.TransactionClient;

/** Erro único para token inexistente, usado, expirado ou do tipo errado: a resposta não diz qual. */
export function tokenInvalidError(): AppError {
  return new AppError('TOKEN_INVALID', 'Link inválido ou expirado.', 400);
}

/**
 * Emite um token novo e invalida os anteriores ainda abertos do mesmo admin e tipo.
 * Passe `tx` para emitir dentro da transação que cria ou altera o admin.
 */
export async function issueToken(adminId: string, kind: TokenKind, ttlMs: number, tx?: Db): Promise<string> {
  const run = async (db: Db): Promise<string> => {
    const now = new Date();
    await db.authToken.updateMany({
      where: { userId: adminId, kind, usedAt: null },
      data: { usedAt: now },
    });
    const token = randomToken(32);
    await db.authToken.create({
      data: { tokenHash: token.hash, kind, userId: adminId, expiresAt: new Date(now.getTime() + ttlMs) },
    });
    return token.raw;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Consome o token: exige que exista, seja do tipo pedido, não tenha sido usado e não esteja
 * expirado. A marcação de `usedAt` é condicional no próprio UPDATE, então duas requisições
 * simultâneas com o mesmo token nunca passam as duas.
 * Passe `tx` para que o consumo seja desfeito se o resto da operação falhar.
 */
export async function consumeToken(raw: string, kind: TokenKind, tx?: Db): Promise<string> {
  const db = tx ?? prisma;
  const tokenHash = sha256Hex(raw);
  const now = new Date();
  const { count } = await db.authToken.updateMany({
    where: { tokenHash, kind, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) throw tokenInvalidError();

  const token = await db.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  if (!token) throw tokenInvalidError();
  return token.userId;
}

/** Mesma validação de `consumeToken`, sem consumir (para a página decidir o que renderizar). */
export async function peekToken(raw: string, kind: TokenKind, tx?: Db): Promise<string> {
  const db = tx ?? prisma;
  const token = await db.authToken.findUnique({
    where: { tokenHash: sha256Hex(raw) },
    select: { userId: true, kind: true, usedAt: true, expiresAt: true },
  });
  if (!token || token.kind !== kind || token.usedAt !== null || token.expiresAt.getTime() <= Date.now()) {
    throw tokenInvalidError();
  }
  return token.userId;
}
