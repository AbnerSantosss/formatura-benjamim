// Acesso ao banco usado pelo E2E (o mesmo do servidor em teste: o de desenvolvimento, ou o do CI).
// Só o globalSetup e o globalTeardown usam este arquivo; os testes falam com a aplicação pelo navegador.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parse } from 'dotenv';

/** Todo admin criado pelo E2E (o do setup e os convidados pela tela) tem este formato de e-mail. */
export const E2E_EMAIL_PREFIX = 'e2e-';
export const E2E_EMAIL_DOMAIN = '@exemplo.invalid';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Endereço do banco: o do ambiente (CI) ou, na falta dele, só a chave `DATABASE_URL` do `.env` local.
 * O restante do `.env` não é lido para `process.env` e nada dele é impresso.
 */
function databaseUrl(): string {
  let url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url) {
    try {
      url = parse(readFileSync(path.resolve('.env'))).DATABASE_URL?.trim() ?? '';
    } catch {
      // Sem `.env`: cai no erro abaixo.
    }
  }
  if (!url) throw new Error('E2E: DATABASE_URL não está definida (nem no ambiente, nem no .env).');

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('E2E: DATABASE_URL inválida.');
  }
  // Trava: o E2E cria e apaga administradores; só em banco local (desenvolvimento ou CI).
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error('E2E: o banco não é local (localhost ou 127.0.0.1). Nada foi alterado.');
  }
  return url;
}

export function e2ePrisma(): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl(), log: ['error'] });
}

/** Remove os admins do E2E; sessões e tokens caem junto (`onDelete: Cascade`). Devolve quantos saíram. */
export async function removeE2eAdmins(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.adminUser.deleteMany({
    where: { email: { startsWith: E2E_EMAIL_PREFIX, endsWith: E2E_EMAIL_DOMAIN } },
  });
  return count;
}
