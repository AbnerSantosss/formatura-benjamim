import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `@/server/env` valida process.env ao ser importado. Cada teste monta o ambiente com vi.stubEnv,
// zera o cache de módulos e importa o registro de novo.
const GATEWAY_VARS = [
  'MP_ACCESS_TOKEN',
  'MP_PUBLIC_KEY',
  'MP_WEBHOOK_SECRET',
  'MP_ENVIRONMENT',
  'MP_API_FLAVOR',
  'FASTPAY_API_URL',
  'FASTPAY_API_KEY',
  'FASTPAY_WEBHOOK_SECRET',
  'IRONPAY_API_URL',
  'IRONPAY_API_KEY',
  'IRONPAY_WEBHOOK_SECRET',
];

function setEnv(vars: Record<string, string>): void {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3180');
  vi.stubEnv('DATABASE_URL', 'postgresql://benjamim:benjamim@localhost:5443/benjamim_test');
  vi.stubEnv('PAYMENT_GATEWAY', 'demo');
  vi.stubEnv('DEMO_MODE', 'false');
  // String vazia = ausente (ver parseEnv). Isola o teste do ambiente da máquina.
  for (const key of GATEWAY_VARS) vi.stubEnv(key, '');
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
}

// O que o painel salvou no banco. Cada teste parte de "nada salvo" (ver beforeEach).
const stored = vi.hoisted(() => ({
  value: {
    active: null as string | null,
    fields: { mercadopago: {}, fastpay: {}, ironpay: {} } as Record<string, Record<string, string>>,
  },
}));
vi.mock('@/server/gateways/stored-config', () => ({
  loadStoredGateways: async () => stored.value,
  invalidateStoredGateways: () => {},
}));

const loadRegistry = () => import('@/server/gateways/registry');

const sampleInput = {
  order: { id: 'ord_teste_1', amountCents: 2500, expiresAt: new Date('2026-10-09T12:10:00.000Z') },
  product: { title: 'Cestas O Boticário', mode: 'NUMBERS' as const, unitCents: 50 },
  quantity: 50,
  payer: { name: 'Maria Silva', email: 'maria@example.com', cpf: '52998224725' },
};

beforeEach(() => {
  vi.resetModules();
  stored.value = { active: null, fields: { mercadopago: {}, fastpay: {}, ironpay: {} } };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('registro de gateways', () => {
  it('escolhe o demo em desenvolvimento com DEMO_MODE=true', async () => {
    setEnv({ PAYMENT_GATEWAY: 'demo', DEMO_MODE: 'true' });
    const { getGateway, getGatewayById, gatewayHealth } = await loadRegistry();

    expect((await getGateway()).id).toBe('demo');
    expect((await getGatewayById('DEMO')).id).toBe('demo');
    expect(await gatewayHealth()).toEqual({
      active: 'demo',
      configured: true,
      others: { mercadopago: false, fastpay: false, ironpay: false },
    });
  });

  it('demo sem DEMO_MODE lança GATEWAY_NOT_CONFIGURED', async () => {
    setEnv({ PAYMENT_GATEWAY: 'demo', DEMO_MODE: 'false' });
    const { getGateway, getGatewayById, gatewayHealth } = await loadRegistry();

    await expect(getGateway()).rejects.toEqual(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED', status: 503 }),
    );
    await expect(getGatewayById('demo')).rejects.toEqual(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED' }),
    );
    expect((await gatewayHealth()).configured).toBe(false);
  });

  it('demo em produção lança: o ambiente nem carrega', async () => {
    setEnv({
      NODE_ENV: 'production',
      PAYMENT_GATEWAY: 'demo',
      DEMO_MODE: 'true',
      AUTH_SECRET: 'a'.repeat(64),
      CPF_ENCRYPTION_KEY: 'b'.repeat(64),
      SMTP_HOST: 'smtp.exemplo.com.br',
    });
    await expect(loadRegistry()).rejects.toThrow(/PAYMENT_GATEWAY não pode ser demo em produção/);
  });

  it('em produção com outro gateway ativo, o demo não é entregue nem por id', async () => {
    setEnv({
      NODE_ENV: 'production',
      PAYMENT_GATEWAY: 'fastpay',
      AUTH_SECRET: 'a'.repeat(64),
      CPF_ENCRYPTION_KEY: 'b'.repeat(64),
      SMTP_HOST: 'smtp.exemplo.com.br',
    });
    const { getGateway, getGatewayById, gatewayHealth } = await loadRegistry();

    await expect(getGatewayById('demo')).rejects.toEqual(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED' }),
    );
    // fastpay sem chaves: não configurado, e nunca cai para o demo.
    await expect(getGateway()).rejects.toEqual(expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED' }));
    expect((await gatewayHealth()).others.demo).toBe(false);
  });

  it('fastpay sem chaves: isConfigured() é falso e getGateway lança', async () => {
    setEnv({ PAYMENT_GATEWAY: 'fastpay' });
    const { getGateway, getGatewayById, gatewayHealth } = await loadRegistry();

    expect((await getGatewayById('fastpay')).isConfigured()).toBe(false);
    await expect(getGateway()).rejects.toEqual(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED', status: 503 }),
    );
    expect(await gatewayHealth()).toMatchObject({ active: 'fastpay', configured: false });
  });

  it('fastpay e ironpay com chaves ficam configurados, mas seguem fail-closed', async () => {
    setEnv({
      PAYMENT_GATEWAY: 'ironpay',
      FASTPAY_API_URL: 'https://api.fastpay.example',
      FASTPAY_API_KEY: 'chave-fastpay-de-teste',
      FASTPAY_WEBHOOK_SECRET: 'segredo-fastpay-de-teste',
      IRONPAY_API_URL: 'https://api.ironpay.example',
      IRONPAY_API_KEY: 'chave-ironpay-de-teste',
      IRONPAY_WEBHOOK_SECRET: 'segredo-ironpay-de-teste',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { getGateway, getGatewayById, gatewayHealth } = await loadRegistry();

    const health = await gatewayHealth();
    expect(health).toMatchObject({ active: 'ironpay', configured: true });
    expect(health.others.fastpay).toBe(true);
    // A saúde só carrega booleanos, nunca o valor de uma chave.
    expect(JSON.stringify(health)).not.toContain('de-teste');

    for (const gateway of [await getGateway(), await getGatewayById('fastpay')]) {
      await expect(gateway.createPixCharge(sampleInput)).rejects.toMatchObject({
        code: 'GATEWAY_NOT_IMPLEMENTED',
        status: 503,
      });
      await expect(gateway.fetchStatus({ providerPaymentId: '1' })).rejects.toMatchObject({
        code: 'GATEWAY_NOT_IMPLEMENTED',
      });
      await expect(gateway.refund({ providerPaymentId: '1' })).rejects.toMatchObject({
        code: 'GATEWAY_NOT_IMPLEMENTED',
      });
      await expect(
        gateway.verifyWebhook({ headers: new Headers(), url: 'http://x/api/webhooks/x', rawBody: '{}' }),
      ).resolves.toEqual({ ok: false, reason: 'not-implemented' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('credencial salva no painel vale no lugar da variável de ambiente, campo a campo', async () => {
    setEnv({
      PAYMENT_GATEWAY: 'mercadopago',
      MP_ACCESS_TOKEN: 'token-do-ambiente-de-teste',
    });
    const { getGateway, gatewayHealth, gatewaySettings } = await loadRegistry();
    // Só o token no ambiente: falta o segredo do webhook.
    await expect(getGateway()).rejects.toEqual(expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED' }));

    stored.value.fields.mercadopago = { webhookSecret: 'segredo-do-painel-de-teste' };
    expect((await getGateway()).id).toBe('mercadopago');
    expect(await gatewayHealth()).toMatchObject({ active: 'mercadopago', configured: true });

    const settings = await gatewaySettings();
    const mp = settings.gateways.find((item) => item.id === 'mercadopago');
    expect(mp).toMatchObject({ configured: true, active: true, implemented: true });
    expect(mp?.fields).toEqual([
      { name: 'accessToken', set: true, source: 'ambiente' },
      { name: 'webhookSecret', set: true, source: 'painel' },
      { name: 'publicKey', set: false, source: null },
    ]);
    // Nenhum segredo sai na leitura do painel.
    expect(JSON.stringify(settings)).not.toContain('de-teste');
  });

  it('gateway ativo escolhido no painel vale no lugar de PAYMENT_GATEWAY', async () => {
    setEnv({ PAYMENT_GATEWAY: 'fastpay' });
    stored.value.active = 'mercadopago';
    stored.value.fields.mercadopago = { accessToken: 'token-de-teste', webhookSecret: 'segredo-de-teste' };
    stored.value.fields.ironpay = { apiUrl: 'https://api.ironpay.example' };
    const { getGateway, gatewaySettings } = await loadRegistry();

    expect((await getGateway()).id).toBe('mercadopago');
    const settings = await gatewaySettings();
    expect(settings).toMatchObject({ active: 'mercadopago', activeSource: 'painel' });
    // Campo que não é segredo volta com o valor.
    expect(settings.gateways.find((item) => item.id === 'ironpay')?.fields[0]).toEqual({
      name: 'apiUrl',
      set: true,
      source: 'painel',
      value: 'https://api.ironpay.example',
    });
  });

  it('id desconhecido lança GATEWAY_NOT_CONFIGURED', async () => {
    setEnv({ PAYMENT_GATEWAY: 'demo', DEMO_MODE: 'true' });
    const { getGatewayById } = await loadRegistry();
    await expect(getGatewayById('paypal')).rejects.toEqual(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED' }),
    );
  });
});

describe('gateway demo', () => {
  it('cria cobrança falsa, aprova por demoApprove e estorna, sem rede', async () => {
    setEnv({ PAYMENT_GATEWAY: 'demo', DEMO_MODE: 'true' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { demoGateway, demoApprove, demoReset, DEMO_QR_CODE_BASE64 } =
      await import('@/server/gateways/demo');
    demoReset();

    const charge = await demoGateway.createPixCharge(sampleInput);
    expect(charge.qrCode).toBe('DEMO-ord_teste_1');
    expect(charge.qrCodeBase64).toBe(DEMO_QR_CODE_BASE64);
    expect(charge.expiresAt).toEqual(sampleInput.order.expiresAt);

    const ref = { providerOrderId: charge.providerOrderId, providerPaymentId: charge.providerPaymentId };
    expect(await demoGateway.fetchStatus(ref)).toMatchObject({
      status: 'pending',
      amountCents: 2500,
      externalReference: 'ord_teste_1',
    });

    demoApprove('ord_teste_1');
    expect(await demoGateway.fetchStatus(ref)).toMatchObject({ status: 'approved', amountCents: 2500 });
    // Só com o id do pagamento também resolve.
    expect(await demoGateway.fetchStatus({ providerPaymentId: charge.providerPaymentId })).toMatchObject({
      status: 'approved',
    });

    expect(await demoGateway.verifyWebhook({ headers: new Headers(), url: 'http://x', rawBody: '' })).toEqual(
      {
        ok: false,
        reason: 'demo',
      },
    );

    expect((await demoGateway.refund(ref)).ok).toBe(true);
    expect((await demoGateway.fetchStatus(ref)).status).toBe('refunded');

    expect(fetchMock).not.toHaveBeenCalled();
    demoReset();
    vi.unstubAllGlobals();
  });

  it('fora de isDemo o adapter recusa tudo', async () => {
    setEnv({ PAYMENT_GATEWAY: 'demo', DEMO_MODE: 'false' });
    const { demoGateway, demoApprove } = await import('@/server/gateways/demo');

    expect(demoGateway.isConfigured()).toBe(false);
    await expect(demoGateway.createPixCharge(sampleInput)).rejects.toMatchObject({
      code: 'GATEWAY_NOT_CONFIGURED',
    });
    expect(() => demoApprove('ord_teste_1')).toThrow(
      expect.objectContaining({ code: 'GATEWAY_NOT_CONFIGURED' }),
    );
  });
});
