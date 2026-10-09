// E2E de fumaça (T21): o caminho feliz de quem contribui e o do painel, mais os snapshots visuais
// das quatro telas de design intocável (decisão 012).
//
// Um único pedido por execução, criado pela própria tela e reaproveitado em pagamento, obrigado,
// snapshots e painel. Os testes rodam em série, na mesma aba: se um falha, os seguintes não rodam.
// Seletores: só papéis, textos e classes que as páginas já têm (nenhum `data-testid` novo).
import { randomBytes, randomInt } from 'node:crypto';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

const CONTRIBUTOR_NAME = 'Contribuinte E2E';
const INVITED_NAME = 'Convidado E2E';

const run = randomBytes(4).toString('hex');
const contributorEmail = `e2e-${run}@exemplo.invalid`;
const invitedEmail = `e2e-convite-${run}@exemplo.invalid`;
// IP fictício por execução (faixa de documentação da RFC 5737). Os limitadores de taxa contam por
// IP lido de `X-Forwarded-For`: sem isto, execuções seguidas somariam no mesmo contador
// (login: 5 a cada 15 minutos; criação de pedido: 10 por minuto).
const clientIp = `203.0.113.${randomInt(1, 255)}`;
const newOwnerPassword = `Nova${randomBytes(18).toString('base64url')}7b`;

let context: BrowserContext;
let page: Page;
let orderId = '';

function credential(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ausente: o globalSetup do E2E não rodou.`);
  return value;
}

/** CPF fictício com dígitos verificadores válidos. */
function validCpf(): string {
  const digits = Array.from({ length: 9 }, () => randomInt(0, 10));
  // Sequência de dígitos iguais é recusada pela validação.
  if (digits.every((digit) => digit === digits[0])) digits[8] = (digits[8] + 1) % 10;
  for (const size of [9, 10]) {
    const sum = digits.slice(0, size).reduce((total, digit, index) => total + digit * (size + 1 - index), 0);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join('');
}

/** Espera fontes e imagens (inclusive as de carregamento tardio) antes de fotografar. */
async function settle(target: Page): Promise<void> {
  await target.evaluate(async () => {
    await document.fonts.ready;
    const step = Math.max(200, window.innerHeight);
    for (let top = 0; top < document.documentElement.scrollHeight; top += step) {
      window.scrollTo({ top, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.complete
          ? null
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
      ),
    );
    await document.fonts.ready;
  });
}

/** Página inteira em 1280×900 e 390×844, com as áreas dinâmicas cobertas pela máscara. */
async function snapshotBoth(name: string, mask: Locator[]): Promise<void> {
  for (const [label, size] of [
    ['desktop', DESKTOP],
    ['mobile', MOBILE],
  ] as const) {
    await page.setViewportSize(size);
    await settle(page);
    await expect(page).toHaveScreenshot(`${name}-${label}.png`, { fullPage: true, mask });
  }
  await page.setViewportSize(DESKTOP);
}

const loginHeading = () => page.getByRole('heading', { name: 'Que bom ter você aqui.' });
const adminNav = (name: string) =>
  page.getByRole('navigation', { name: 'Navegação do backoffice' }).getByRole('button', { name });

async function login(email: string, password: string): Promise<void> {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Entrar no painel' }).click();
}

test.beforeAll(async ({ browser }, testInfo) => {
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: DESKTOP,
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp },
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test('landing carrega e mostra a barra de progresso', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Benjamim');
  const progress = page.getByRole('region', { name: 'Progresso da campanha' });
  await expect(progress).toBeVisible();
  await expect(progress.getByRole('progressbar', { name: 'Meta arrecadada' })).toBeVisible();
  await expect(progress.getByText('Já arrecadamos')).toBeVisible();

  // Máscara: valores arrecadados, percentual e barra (mudam a cada pedido aprovado).
  await snapshotBoth('landing', [page.locator('.progress-card')]);
});

test('contribuir mostra a grade, "aleatório" marca 10 números e o envio abre o pagamento', async () => {
  await page.goto('/contribuir?valor=5');
  const grid = page.getByRole('group', { name: 'Tabela 10 por 10 de números' });
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('button')).toHaveCount(100);
  const random = page.getByRole('button', { name: 'Gerar meus números' });
  // Habilita quando a lista de números ocupados chegou do servidor.
  await expect(random).toBeEnabled();

  // Máscara: grade (números ocupados mudam) e o resumo de progresso da campanha.
  await snapshotBoth('contribuir', [page.locator('.number-grid'), page.locator('.progress-card')]);

  await random.click();
  await expect(page.getByText('Sua escolha está completa.')).toBeVisible();
  await expect(page.getByLabel('Números escolhidos').locator('span')).toHaveCount(10);

  await page.locator('input[name="name"]').fill(CONTRIBUTOR_NAME);
  await page.locator('input[name="cpf"]').fill(validCpf());
  await page.locator('input[name="phone"]').fill('85988887777');
  await page.locator('input[name="email"]').fill(contributorEmail);
  await page.getByRole('button', { name: 'Quero garantir meus números!' }).click();

  await page.waitForURL(/\/pagamento\/[^/?]+\?t=.+/);
  const url = new URL(page.url());
  orderId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  expect(orderId).not.toBe('');
  expect(url.searchParams.get('t')).toBeTruthy();
});

test('pagamento mostra o pedido pendente', async () => {
  await expect(page.getByRole('heading', { name: 'Seu pedido via Pix' })).toBeVisible();
  await expect(page.locator('.payment-amount')).toHaveText(/R\$\s5,00/);
  await expect(page.locator('.order-product-detail')).toContainText('10 números');
  await expect(page.locator('.demo-code-label input')).not.toHaveValue('');
  await expect(page.getByRole('button', { name: 'Simular aprovação (demo)' })).toBeEnabled();

  // Máscara: cronômetro, QR, código copia-e-cola, números do pedido e código do registro.
  await snapshotBoth('pagamento', [
    page.locator('.demo-timer'),
    page.locator('.demo-qr'),
    page.locator('.demo-code-label input'),
    page.locator('.order-product-detail'),
    page.locator('.demo-payment-card > small'),
  ]);
});

test('simular aprovação leva à página de obrigado', async () => {
  await page.getByRole('button', { name: 'Simular aprovação (demo)' }).click();
  await page.waitForURL((url) => url.pathname === `/obrigado/${encodeURIComponent(orderId)}`);
  expect(new URL(page.url()).searchParams.get('t')).toBeTruthy();
  await expect(page.getByRole('heading', { name: /Você faz parte\s*dessa conquista!/ })).toBeVisible();
  await expect(page.locator('.thanks-receipt strong')).toHaveText(/R\$\s5,00/);
  await expect(page.locator('.order-product-detail')).toContainText('10 números');

  // Máscara: produto e números do pedido. Esta tela não mostra nome, código nem data.
  await snapshotBoth('obrigado', [page.locator('.order-product-detail')]);
});

test('/regulamento fala do sorteio', async () => {
  await page.goto('/regulamento');
  await expect(page.locator('main')).toContainText(/sorteio/i);
});

test('/admin sem sessão mostra o login e rota protegida volta para ele', async () => {
  await page.goto('/admin');
  await expect(loginHeading()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar no painel' })).toBeVisible();

  // Sem o cookie de sessão, o proxy manda para o login guardando o destino.
  await page.goto('/admin/trocar-senha');
  await page.waitForURL((url) => url.pathname === '/admin');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/admin/trocar-senha');
  await expect(loginHeading()).toBeVisible();
});

test('login com senha temporária exige a troca e depois mostra as métricas', async () => {
  await page.goto('/admin');
  await login(credential('E2E_OWNER_EMAIL'), credential('E2E_OWNER_PASSWORD'));

  await page.waitForURL((url) => url.pathname === '/admin/trocar-senha');
  await expect(page.getByText('Sua senha é temporária. Defina uma nova para continuar.')).toBeVisible();
  await page.locator('input[name="currentPassword"]').fill(credential('E2E_OWNER_PASSWORD'));
  await page.locator('input[name="password"]').fill(newOwnerPassword);
  await page.locator('input[name="confirmation"]').fill(newOwnerPassword);
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();

  await page.waitForURL((url) => url.pathname === '/admin');
  await expect(page.getByRole('heading', { name: 'Olá, família do Benjamim!' })).toBeVisible();
  await expect(page.locator('.admin-account')).toContainText('Proprietário');
  const metrics = page.locator('.metric-grid article');
  await expect(metrics).toHaveCount(4);
  await expect(metrics.nth(0)).toContainText('Arrecadado');
  await expect(metrics.nth(0)).toContainText(/R\$\s[\d.]+,\d{2}/);
  // O pedido deste E2E acabou de ser aprovado: há pelo menos um.
  await expect(metrics.nth(0)).toContainText(/[1-9]\d* pedido\(s\) aprovado\(s\)/);
  await expect(metrics.nth(1)).toContainText('Meta');
  await expect(page.getByRole('progressbar', { name: 'Meta de arrecadação' })).toBeVisible();
});

test('painel acha o pedido aprovado e reenvia o e-mail de confirmação', async () => {
  await page.getByRole('searchbox', { name: 'Buscar pedido' }).fill(contributorEmail);
  const row = page.getByRole('row').filter({ hasText: contributorEmail });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(CONTRIBUTOR_NAME);
  await expect(row).toContainText('Aprovado');
  await expect(row).toContainText(orderId.slice(0, 13));

  await row.getByRole('button', { name: 'Reenviar e-mail' }).click();
  await expect(page.getByText(`E-mail de confirmação reenviado para ${CONTRIBUTOR_NAME}.`)).toBeVisible();
});

test('proprietário convida, reenvia o convite, desativa e reativa um usuário', async () => {
  await adminNav('Usuários').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Usuários do painel' })).toBeVisible();

  const invite = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Convidar' }) });
  await invite.getByLabel('Nome').fill(INVITED_NAME);
  await invite.getByLabel('E-mail').fill(invitedEmail);
  await expect(invite.getByLabel('Papel').locator('option')).toHaveText(['Administrador', 'Proprietário']);
  await invite.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText(`Convite enviado para ${INVITED_NAME}.`)).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: invitedEmail });
  await expect(row).toContainText('Convidado');
  await row.getByRole('button', { name: 'Reenviar convite' }).click();
  await expect(page.getByText(`Convite reenviado para ${INVITED_NAME}.`)).toBeVisible();

  await row.getByRole('button', { name: 'Desativar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Desativar este acesso?' });
  await expect(dialog).toContainText(invitedEmail);
  await dialog.getByRole('button', { name: 'Sim, desativar' }).click();
  await expect(page.getByText(`Acesso de ${INVITED_NAME} desativado.`)).toBeVisible();
  await expect(row).toContainText('Desativado');

  await row.getByRole('button', { name: 'Reativar' }).click();
  await expect(page.getByText(`Acesso de ${INVITED_NAME} reativado.`)).toBeVisible();
  await expect(row).not.toContainText('Desativado');
});

test('sessão encerrada: a próxima chamada do painel (401) volta para o login', async () => {
  await context.clearCookies();
  // Trocar de seção monta a tabela de pedidos, que consulta a API sem cookie e recebe 401.
  await adminNav('Visão geral').click();
  await expect(loginHeading()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/admin');
});

test('papel ADMIN não vê o que é só do proprietário e consegue sair', async () => {
  await login(credential('E2E_HELPER_EMAIL'), credential('E2E_HELPER_PASSWORD'));
  await expect(page.getByRole('heading', { name: 'Olá, família do Benjamim!' })).toBeVisible();
  await expect(page.locator('.admin-account')).toContainText('Administrador');

  await adminNav('Usuários').click();
  await expect(
    page.getByText('Só o proprietário convida outro proprietário e desativa acessos.'),
  ).toBeVisible();
  const invite = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Convidar' }) });
  await expect(invite.getByLabel('Papel').locator('option')).toHaveText(['Administrador']);
  // A lista carregou (o convidado do teste anterior está nela) e não oferece desativar nem reativar.
  await expect(page.getByRole('row').filter({ hasText: invitedEmail })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desativar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reativar' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(loginHeading()).toBeVisible();
});
