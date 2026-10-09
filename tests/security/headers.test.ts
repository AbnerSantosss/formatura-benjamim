// Cabeçalhos de segurança (T22): a função `headers()` do `next.config.ts` é chamada direto.
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(nodeEnv: string): Promise<Rule[]> {
  vi.stubEnv('NODE_ENV', nodeEnv);
  return (await nextConfig.headers!()) as Rule[];
}

/** Cabeçalhos de uma regra, com a chave em minúsculas. */
async function headersOf(source: string, nodeEnv = 'production'): Promise<Record<string, string>> {
  const rule = (await rules(nodeEnv)).find((item) => item.source === source);
  if (!rule) throw new Error(`regra ${source} não existe`);
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

const directives = (csp: string): Record<string, string[]> =>
  Object.fromEntries(
    csp.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cabeçalhos de segurança de todas as rotas, inclusive a landing', () => {
  it('a regra geral cobre qualquer caminho', async () => {
    const all = await rules('production');
    expect(all[0]?.source).toBe('/(.*)');
  });

  it('traz HSTS, nosniff, anti-frame, referrer e permissões', async () => {
    const headers = await headersOf('/(.*)');
    expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('CSP de produção não tem unsafe-eval e restringe as origens ao próprio site', async () => {
    const csp = directives((await headersOf('/(.*)', 'production'))['content-security-policy']);
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'https:']);
    expect(csp['font-src']).toEqual(["'self'", 'data:']);
    expect(csp['connect-src']).toEqual(["'self'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('unsafe-eval só existe fora de produção (o React precisa dele em desenvolvimento)', async () => {
    const dev = (await headersOf('/(.*)', 'development'))['content-security-policy'];
    const prod = (await headersOf('/(.*)', 'production'))['content-security-policy'];
    expect(directives(dev)['script-src']).toContain("'unsafe-eval'");
    expect(prod).not.toContain('unsafe-eval');
  });

  it('não anuncia o framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe('páginas e respostas com dado de pessoa ou do painel', () => {
  it.each(['/admin/:path*', '/pagamento/:path*', '/obrigado/:path*', '/api/:path*'])(
    '%s fica fora de buscadores e de caches',
    async (source) => {
      const headers = await headersOf(source);
      expect(headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(headers['cache-control']).toBe('no-store');
    },
  );
});
