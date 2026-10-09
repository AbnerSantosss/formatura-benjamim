import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS, rateLimit, resetRateLimits } from '@/server/rate-limit';

const LIMIT = { limit: 3, windowMs: 60_000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
  resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit', () => {
  it('aceita até o limite e recusa a seguinte, dizendo quanto falta', () => {
    expect(rateLimit('a', LIMIT)).toEqual({ ok: true, retryAfterSec: 0 });
    vi.advanceTimersByTime(10_000);
    expect(rateLimit('a', LIMIT).ok).toBe(true);
    expect(rateLimit('a', LIMIT).ok).toBe(true);
    // A mais antiga foi há 10 s: faltam 50 s para ela sair da janela de 60 s.
    expect(rateLimit('a', LIMIT)).toEqual({ ok: false, retryAfterSec: 50 });
  });

  it('volta a aceitar quando a tentativa mais antiga sai da janela', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('a', LIMIT);
    vi.advanceTimersByTime(59_999);
    expect(rateLimit('a', LIMIT)).toEqual({ ok: false, retryAfterSec: 1 });
    vi.advanceTimersByTime(1);
    expect(rateLimit('a', LIMIT).ok).toBe(true);
  });

  it('tentativa recusada não entra na conta', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('a', LIMIT);
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(1_000);
      expect(rateLimit('a', LIMIT).ok).toBe(false);
    }
    // 60 s depois das três aceitas a janela está vazia, apesar das 20 recusadas no caminho.
    vi.advanceTimersByTime(40_000);
    expect(rateLimit('a', LIMIT).ok).toBe(true);
    expect(rateLimit('a', LIMIT).ok).toBe(true);
    expect(rateLimit('a', LIMIT).ok).toBe(true);
    expect(rateLimit('a', LIMIT).ok).toBe(false);
  });

  it('cada chave conta separado, com a própria janela', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('ip:1', LIMIT);
    expect(rateLimit('ip:1', LIMIT).ok).toBe(false);
    expect(rateLimit('ip:2', LIMIT).ok).toBe(true);

    const curta = { limit: 1, windowMs: 1_000 };
    expect(rateLimit('curta', curta).ok).toBe(true);
    expect(rateLimit('curta', curta).ok).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(rateLimit('curta', curta).ok).toBe(true);
    expect(rateLimit('ip:1', LIMIT).ok).toBe(false);
  });

  it('resetRateLimits zera os contadores', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('a', LIMIT);
    resetRateLimits();
    expect(rateLimit('a', LIMIT).ok).toBe(true);
  });

  it('limites das rotas públicas: 10 pedidos e 120 leituras por minuto', () => {
    expect(RATE_LIMITS.createOrder).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.publicGet).toEqual({ limit: 120, windowMs: 60_000 });
    for (let i = 0; i < 10; i += 1) expect(rateLimit('pedidos:ip', RATE_LIMITS.createOrder).ok).toBe(true);
    expect(rateLimit('pedidos:ip', RATE_LIMITS.createOrder)).toEqual({ ok: false, retryAfterSec: 60 });
  });
});
