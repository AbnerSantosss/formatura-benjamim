// Carrega .env.test por cima do ambiente e recusa rodar fora do banco de teste.
// Usado pelo global-setup, pelo setup de cada arquivo e pelos utilitários de banco.
import path from 'node:path';
import { config } from 'dotenv';

export function loadTestEnv(): void {
  config({ path: path.resolve('.env.test'), override: true, quiet: true });
  assertTestDatabase();
}

/** Trava de segurança: os testes truncam tabelas, então só aceitam o Postgres de teste local. */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  let safe = false;
  try {
    const parsed = new URL(url);
    safe =
      ['localhost', '127.0.0.1'].includes(parsed.hostname) &&
      parsed.port === '5443' &&
      parsed.pathname === '/test';
  } catch {
    safe = false;
  }
  // A mensagem não mostra a URL (pode conter senha).
  if (!safe) throw new Error('Testes de integração só rodam contra o banco de teste (localhost:5443/test).');
}
