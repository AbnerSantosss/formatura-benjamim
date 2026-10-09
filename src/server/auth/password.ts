// Sem `import 'server-only'` de propósito: `scripts/admin-create.ts` roda com tsx, fora do Next,
// e precisa deste módulo. Ele é puro (bcryptjs + Zod) e não lê ambiente nem banco.
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const BCRYPT_COST = 12;

/** Política de senha do painel: 10 a 128 caracteres, com pelo menos uma letra e um número. */
export const passwordPolicy = z
  .string('Informe a senha.')
  .min(10, 'A senha precisa ter pelo menos 10 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.')
  .regex(/\p{L}/u, 'A senha precisa ter pelo menos uma letra.')
  .regex(/\d/, 'A senha precisa ter pelo menos um número.');

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** Nunca lança: hash malformado ou vazio devolve `false`. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
