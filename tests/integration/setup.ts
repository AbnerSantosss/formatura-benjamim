// Roda em cada arquivo de teste de integração, antes dos imports do próprio teste:
// carrega .env.test (para `@/server/env` e o Prisma enxergarem o banco de teste)
// e esvazia todas as tabelas antes do arquivo começar.
import { afterAll, beforeAll } from 'vitest';
import { loadTestEnv } from './test-env';

loadTestEnv();

beforeAll(async () => {
  const { truncateAll } = await import('./db');
  await truncateAll();
});

afterAll(async () => {
  const { testPrisma } = await import('./db');
  await testPrisma().$disconnect();
});
