// Captura o visual do protótipo (dados em localStorage) para revisao/baseline/.
// Uso: npm run dev (porta 3180) e, em outro terminal, node scripts/baseline-demo.mjs [pasta-de-saida]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL || 'http://127.0.0.1:3180';
const out = process.argv[2] || 'revisao/baseline';
const KEY = 'benjamim.frontend-demo.v1';
const numbers = [7, 42, 108, 250, 999, 1234, 2500, 3333, 4096, 5000];
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const pages = [
  { name: 'landing', path: '/' },
  { name: 'contribuir', path: '/contribuir?valor=5' },
  { name: 'pagamento', path: '/pagamento?id=demo-baseline-pendente' },
  { name: 'obrigado', path: '/obrigado?id=demo-baseline-aprovado' },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ([key, picked]) => {
      const now = Date.now();
      const order = (id, status) => ({
        id,
        amount: 500,
        mode: 'numbers',
        productId: 'cestas-boticario',
        numbers: picked,
        createdAt: now,
        expiresAt: now + 600000,
        status,
      });
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          goal: 250000,
          payments: [order('demo-baseline-pendente', 'pending'), order('demo-baseline-aprovado', 'approved')],
        }),
      );
    },
    [KEY, numbers],
  );
  const page = await context.newPage();
  for (const target of pages) {
    await page.goto(base + target.path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${target.name}-${viewport.name}.png`, fullPage: true });
    console.log(`${target.name}-${viewport.name}.png`);
  }
  await context.close();
}
await browser.close();
