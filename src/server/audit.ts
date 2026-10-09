import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';

export type AuditData = {
  actorId?: string;
  orderId?: string;
  /** Nunca colocar CPF, e-mail, telefone, senha ou token aqui. */
  meta?: Record<string, unknown>;
};

// Defesa extra: mesmo que alguém passe por engano, estas chaves não chegam ao banco.
const FORBIDDEN_META_KEY = /cpf|e-?mail|phone|telefone|celular|whatsapp|senha|password|token|secret/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const clean: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (!FORBIDDEN_META_KEY.test(key)) clean[key] = scrub(inner);
    }
    return clean;
  }
  return value;
}

/**
 * Grava uma linha em `AuditLog`. `orderId` vira `target`.
 * Passe `tx` para gravar dentro da mesma transação da mudança auditada.
 */
export async function audit(
  action: string,
  data: AuditData = {},
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  const meta =
    data.meta === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(scrub(data.meta))) as Prisma.InputJsonValue);
  await client.auditLog.create({
    data: {
      action,
      actorId: data.actorId ?? null,
      target: data.orderId ?? null,
      meta,
    },
  });
}
