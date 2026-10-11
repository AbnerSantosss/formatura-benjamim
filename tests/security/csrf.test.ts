// Checagem de origem do painel (`assertSameOrigin`) e a rota do sorteio, a única com GET conferido.
// Sem banco: sessão e serviço do sorteio são dublês; a origem esperada vem de `NEXT_PUBLIC_SITE_URL`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SITE = 'https://campanha.example';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getDrawState: vi.fn(),
  performDraw: vi.fn(),
}));

// O valor tem barra final e caminho de propósito: só a origem entra na comparação.
vi.mock('@/server/env', () => ({
  env: { NEXT_PUBLIC_SITE_URL: 'https://campanha.example/', LOG_LEVEL: 'silent' },
}));
vi.mock('@/server/auth/require-admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/server/draw.service', () => ({
  getDrawState: mocks.getDrawState,
  performDraw: mocks.performDraw,
}));

import { GET, POST } from '@/app/api/admin/sorteio/route';
import { assertSameOrigin } from '@/server/auth/csrf';
import { AppError } from '@/server/errors';

const URL_SORTEIO = `${SITE}/api/admin/sorteio`;

const request = (headers: Record<string, string> = {}, method = 'GET') =>
  new Request(URL_SORTEIO, {
    method,
    headers: method === 'GET' ? headers : { 'content-type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : '{}',
  });

const accepted = (headers: Record<string, string>, method = 'GET') => {
  try {
    assertSameOrigin(request(headers, method));
    return true;
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN_ORIGIN' && error.status === 403) return false;
    throw error;
  }
};

describe('assertSameOrigin', () => {
  it('aceita Origin igual à origem do site (o que o navegador manda em POST e PATCH)', () => {
    expect(accepted({ origin: SITE }, 'POST')).toBe(true);
  });

  it('sem Origin, aceita Referer do próprio site (GET de mesma origem no navegador)', () => {
    expect(accepted({ referer: `${SITE}/admin/painel?aba=1` })).toBe(true);
  });

  it('sem Origin nem Referer, aceita só Sec-Fetch-Site: same-origin', () => {
    expect(accepted({ 'sec-fetch-site': 'same-origin' })).toBe(true);
    for (const value of ['same-site', 'cross-site', 'none', 'SAME-ORIGIN', 'same-origin, cross-site', '']) {
      expect(accepted({ 'sec-fetch-site': value })).toBe(false);
    }
  });

  it('sem nenhum cabeçalho de origem (curl, script) recusa com 403', () => {
    expect(accepted({})).toBe(false);
    expect(accepted({}, 'POST')).toBe(false);
  });

  it('Origin ou Referer de outro lugar recusa, mesmo com Sec-Fetch-Site: same-origin', () => {
    const outros = [
      'https://outro.example',
      'http://campanha.example', // esquema diferente
      'https://campanha.example:8443', // porta diferente
      'https://www.campanha.example', // subdomínio
      'https://campanha.example.evil.test',
      'null', // iframe em sandbox, redirecionamento entre origens
      'não é url',
    ];
    for (const outro of outros) {
      expect(accepted({ origin: outro }, 'POST')).toBe(false);
      expect(accepted({ origin: outro, 'sec-fetch-site': 'same-origin' }, 'POST')).toBe(false);
      expect(accepted({ referer: `${outro}/admin`, 'sec-fetch-site': 'same-origin' })).toBe(false);
    }
  });

  it('Origin vale mais que Referer: Origin estranho não é salvo por Referer do site', () => {
    expect(accepted({ origin: 'https://outro.example', referer: `${SITE}/admin` }, 'POST')).toBe(false);
  });

  it('abrir o dev por localhost com o site em 127.0.0.1 não é a mesma origem', () => {
    expect(accepted({ origin: 'http://localhost:3180' }, 'POST')).toBe(false);
    expect(accepted({ referer: 'http://localhost:3180/admin/painel' })).toBe(false);
  });
});

describe('/api/admin/sorteio', () => {
  const state = { drawAt: null, canDraw: false, current: null, eligibleCount: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ admin: { id: 'admin-1', role: 'OWNER' } });
    mocks.getDrawState.mockResolvedValue(state);
    mocks.performDraw.mockResolvedValue({ state, emails: { winnerSent: true } });
  });

  it('GET do navegador (sem Origin, com Referer do site) devolve o estado', async () => {
    const res = await GET(request({ referer: `${SITE}/admin/painel`, 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state });
  });

  it('GET do navegador com o Referer suprimido ainda carrega o card do sorteio', async () => {
    const res = await GET(request({ 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(200);
  });

  it('GET sem cabeçalho de origem ou vindo de outro site responde 403 e não lê o sorteio', async () => {
    const responses = await Promise.all([
      GET(request({})),
      GET(request({ referer: 'https://outro.example/pagina', 'sec-fetch-site': 'cross-site' })),
      GET(request({ 'sec-fetch-site': 'cross-site' })),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN_ORIGIN');
    }
    expect(mocks.getDrawState).not.toHaveBeenCalled();
  });

  it('POST com Origin do site sorteia; de outra origem ou sem origem responde 403 e não sorteia', async () => {
    const recusadas = await Promise.all([
      POST(request({}, 'POST')),
      POST(request({ origin: 'https://outro.example' }, 'POST')),
      POST(request({ origin: 'https://outro.example', 'sec-fetch-site': 'same-origin' }, 'POST')),
    ]);
    for (const res of recusadas) expect(res.status).toBe(403);
    expect(mocks.performDraw).not.toHaveBeenCalled();

    const res = await POST(request({ origin: SITE, 'sec-fetch-site': 'same-origin' }, 'POST'));
    expect(res.status).toBe(200);
    expect(mocks.performDraw).toHaveBeenCalledTimes(1);
    expect(mocks.performDraw).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', role: 'OWNER', force: undefined }),
    );
  });

  it('a sessão é conferida antes da origem: sem login responde 401 com qualquer origem', async () => {
    mocks.requireAdmin.mockRejectedValue(new AppError('UNAUTHORIZED', 'Faça login para continuar.', 401));
    const responses = await Promise.all([
      GET(request({})),
      GET(request({ referer: `${SITE}/admin` })),
      POST(request({ origin: SITE }, 'POST')),
      POST(request({ origin: 'https://outro.example' }, 'POST')),
    ]);
    for (const res of responses) expect(res.status).toBe(401);
  });
});
