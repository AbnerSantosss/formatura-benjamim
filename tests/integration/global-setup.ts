// Roda uma única vez por execução de `npm run test:integration`:
// carrega .env.test e aplica as migrações no banco de teste.
// Antes: docker compose -f docker-compose.test.yml up -d
import { execSync } from 'node:child_process';
import { loadTestEnv } from './test-env';

export default function globalSetup(): void {
  loadTestEnv();
  try {
    execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).slice(-2000) : '';
    throw new Error(
      'Falha ao aplicar as migrações no banco de teste. O container está no ar? ' +
        '(docker compose -f docker-compose.test.yml up -d)\n' +
        detail,
    );
  }
}
