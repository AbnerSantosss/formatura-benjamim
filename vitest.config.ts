import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { 'server-only': path.resolve('tests/stubs/server-only.ts'), '@': path.resolve('src') } },
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    // `tests/security/*.int.test.ts` precisa de banco: roda com os testes de integração.
    exclude: ['tests/integration/**', 'tests/e2e/**', 'tests/security/**/*.int.test.ts'],
    environment: 'node',
    // Nenhum teste unitário fala com SMTP real, mesmo que algo carregue o .env local.
    env: { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' },
  },
});
