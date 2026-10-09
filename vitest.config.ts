import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { 'server-only': path.resolve('tests/stubs/server-only.ts'), '@': path.resolve('src') } },
  test: { include: ['tests/**/*.test.{ts,mjs}'], exclude: ['tests/integration/**', 'tests/e2e/**'], environment: 'node' },
});
