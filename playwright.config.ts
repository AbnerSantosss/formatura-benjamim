import { defineConfig, devices } from '@playwright/test';

// E2E de fumaça (T21). Um navegador, um worker, em série: o fluxo cria UM pedido por execução e o
// reaproveita em pagamento, obrigado, snapshots e painel.
const baseURL = 'http://127.0.0.1:3180';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  outputDir: 'test-results',
  // Só o relatório de terminal. O relatório HTML grava em disco o valor de cada campo preenchido
  // (inclusive as senhas de teste), por isso não é gerado por padrão.
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  // Baseline visual (decisão 012) em pasta própria, um arquivo por tela, viewport e plataforma.
  snapshotPathTemplate: 'tests/e2e/__snapshots__/{arg}-{platform}{ext}',
  // A baseline commitada é do Windows. Em outra plataforma (CI em Linux) as fontes rasterizam
  // diferente: lá a comparação visual é desligada por esta variável e o resto do fluxo roda igual.
  ignoreSnapshots: process.env.E2E_IGNORE_SNAPSHOTS === '1',
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
    // Sem trace, vídeo nem captura: gravariam em disco o que é digitado (senhas de teste, CPF fictício).
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // Em desenvolvimento o servidor já está no ar na 3180 e é reaproveitado.
    reuseExistingServer: true,
    timeout: 180_000,
    // Um servidor iniciado pelo Playwright nunca usa gateway nem SMTP reais: estas variáveis têm
    // prioridade sobre o `.env` (o Next não sobrescreve o que já está no ambiente).
    env: {
      DEMO_MODE: 'true',
      PAYMENT_GATEWAY: 'demo',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
      SMTP_USER: '',
      SMTP_PASS: '',
    },
  },
});
