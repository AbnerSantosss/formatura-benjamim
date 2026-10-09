// Carrega .env.test por cima do ambiente e recusa rodar fora do banco de teste.
// Usado pelo global-setup, pelo setup de cada arquivo e pelos utilitários de banco.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';

// Variáveis de serviços reais (SMTP, gateways, admin inicial). O Prisma Client carrega o `.env` local
// sem sobrescrever o que já existe; deixá-las vazias aqui impede que um teste fale com serviço de verdade.
const REAL_SERVICE_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_REPLY_TO',
  'MP_ACCESS_TOKEN',
  'MP_PUBLIC_KEY',
  'MP_WEBHOOK_SECRET',
  'MP_ENVIRONMENT',
  'MP_API_FLAVOR',
  'FASTPAY_API_KEY',
  'FASTPAY_WEBHOOK_SECRET',
  'IRONPAY_API_KEY',
  'IRONPAY_WEBHOOK_SECRET',
  'ADMIN_BOOTSTRAP_EMAIL',
  'ADMIN_BOOTSTRAP_NAME',
  'ADMIN_BOOTSTRAP_PASSWORD',
];

export function loadTestEnv(): void {
  const file = path.resolve('.env.test');
  const defined = parse(readFileSync(file));
  for (const key of REAL_SERVICE_KEYS) {
    if (!(key in defined)) process.env[key] = '';
  }
  config({ path: file, override: true, quiet: true });
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
