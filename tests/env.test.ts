import { afterEach, describe, expect, it, vi } from 'vitest';

// `src/server/env.ts` executa `parseEnv(process.env)` ao ser importado.
// O env mínimo precisa existir ANTES do import, por isso o vi.hoisted.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3180';
  process.env.DATABASE_URL = 'postgresql://benjamim:benjamim@localhost:5443/benjamim_test';
  process.env.PAYMENT_GATEWAY = 'demo';
});

import { parseEnv } from '@/server/env';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

function raw(vars: Record<string, string>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

const devMinimo = {
  NODE_ENV: 'development',
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3180',
  DATABASE_URL: 'postgresql://benjamim:benjamim@localhost:5442/benjamim',
  PAYMENT_GATEWAY: 'demo',
};

const prodValido = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SITE_URL: 'https://benjamim.exemplo.com.br',
  DATABASE_URL: 'postgresql://user:pass@db:5432/benjamim',
  AUTH_SECRET: HEX_A,
  CPF_ENCRYPTION_KEY: HEX_B,
  PAYMENT_GATEWAY: 'mercadopago',
  MP_ACCESS_TOKEN: 'token-de-teste',
  MP_WEBHOOK_SECRET: 'segredo-de-teste',
  SMTP_HOST: 'smtp.exemplo.com.br',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseEnv', () => {
  it('aceita o env mínimo de desenvolvimento', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = parseEnv(raw(devMinimo));

    expect(env.NODE_ENV).toBe('development');
    expect(env.PAYMENT_GATEWAY).toBe('demo');
    expect(env.DEMO_MODE).toBe(false);
    expect(env.LOG_LEVEL).toBe('info');
    // Sem segredos em dev: usa o valor fixo de desenvolvimento (32 bytes hex).
    expect(env.AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(env.CPF_ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
    // Avisos nunca carregam o valor do segredo.
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toContain(env.AUTH_SECRET);
      expect(String(call[0])).not.toContain(env.CPF_ENCRYPTION_KEY);
    }
  });

  it('usa development quando NODE_ENV não vem', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { NODE_ENV: _omit, ...semNodeEnv } = devMinimo;
    void _omit;
    expect(parseEnv(raw(semNodeEnv)).NODE_ENV).toBe('development');
  });

  it('converte DEMO_MODE em boolean', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseEnv(raw({ ...devMinimo, DEMO_MODE: 'true' })).DEMO_MODE).toBe(true);
    expect(parseEnv(raw({ ...devMinimo, DEMO_MODE: 'false' })).DEMO_MODE).toBe(false);
  });

  it('trata variável vazia como ausente', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = parseEnv(raw({ ...devMinimo, MP_ACCESS_TOKEN: '', SMTP_PORT: '' }));
    expect(env.MP_ACCESS_TOKEN).toBeUndefined();
    expect(env.SMTP_PORT).toBeUndefined();
  });

  it('aceita um env de produção completo', () => {
    const env = parseEnv(raw(prodValido));
    expect(env.NODE_ENV).toBe('production');
    expect(env.AUTH_SECRET).toBe(HEX_A);
    expect(env.CPF_ENCRYPTION_KEY).toBe(HEX_B);
  });

  it('falha em produção com DEMO_MODE=true', () => {
    expect(() => parseEnv(raw({ ...prodValido, DEMO_MODE: 'true' }))).toThrow(
      'DEMO_MODE não pode ser true em produção',
    );
  });

  it('falha em produção com gateway demo', () => {
    expect(() => parseEnv(raw({ ...prodValido, PAYMENT_GATEWAY: 'demo' }))).toThrow(
      /PAYMENT_GATEWAY: .*demo em produção/,
    );
  });

  it('falha em produção com AUTH_SECRET de 10 caracteres, sem vazar o valor', () => {
    const curto = 'abcdef0123';
    let message = '';
    try {
      parseEnv(raw({ ...prodValido, AUTH_SECRET: curto }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('AUTH_SECRET: ');
    expect(message).not.toContain(curto);
  });

  it('falha em produção sem AUTH_SECRET e sem CPF_ENCRYPTION_KEY', () => {
    const { AUTH_SECRET: _a, CPF_ENCRYPTION_KEY: _c, ...semSegredos } = prodValido;
    void _a;
    void _c;
    expect(() => parseEnv(raw(semSegredos))).toThrow(/AUTH_SECRET: [\s\S]*CPF_ENCRYPTION_KEY: /);
  });

  it('falha em produção sem SMTP_HOST', () => {
    const { SMTP_HOST: _s, ...semSmtp } = prodValido;
    void _s;
    expect(() => parseEnv(raw(semSmtp))).toThrow(/SMTP_HOST: /);
  });

  it('mercadopago sem credenciais no ambiente: só aviso, inclusive em produção (podem vir do painel)', () => {
    const { MP_ACCESS_TOKEN: _t, MP_WEBHOOK_SECRET: _w, ...prodSemMp } = prodValido;
    void _t;
    void _w;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseEnv(raw(prodSemMp)).PAYMENT_GATEWAY).toBe('mercadopago');
    expect(warn).toHaveBeenCalled();

    const env = parseEnv(raw({ ...devMinimo, PAYMENT_GATEWAY: 'mercadopago' }));
    expect(env.PAYMENT_GATEWAY).toBe('mercadopago');
  });

  it('MP_API_FLAVOR tem padrão orders', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseEnv(raw(devMinimo)).MP_API_FLAVOR).toBe('orders');
    expect(parseEnv(raw({ ...devMinimo, MP_API_FLAVOR: 'payments' })).MP_API_FLAVOR).toBe('payments');
  });

  it('a mensagem de erro lista nome e motivo, nunca o valor', () => {
    const urlRuim = 'isto-nao-e-url';
    const gatewayRuim = 'gateway-inexistente';
    let message = '';
    try {
      parseEnv(raw({ ...devMinimo, NEXT_PUBLIC_SITE_URL: urlRuim, PAYMENT_GATEWAY: gatewayRuim }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('NEXT_PUBLIC_SITE_URL: ');
    expect(message).toContain('PAYMENT_GATEWAY: ');
    expect(message).not.toContain(urlRuim);
    expect(message).not.toContain(gatewayRuim);
  });
});
