import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Testes de integração: usam o Postgres de teste (docker-compose.test.yml, porta 5443).
// Os arquivos compartilham um único banco, por isso rodam em série (sem paralelismo entre arquivos).
export default defineConfig({
  resolve: {
    alias: { 'server-only': path.resolve('tests/stubs/server-only.ts'), '@': path.resolve('src') },
  },
  test: {
    include: ['tests/integration/**/*.test.ts', 'tests/security/**/*.int.test.ts'],
    environment: 'node',
    // Roda uma vez por execução: carrega .env.test e aplica as migrações.
    globalSetup: ['tests/integration/global-setup.ts'],
    // Roda em cada arquivo, antes dos imports do teste: carrega .env.test e trunca as tabelas.
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
