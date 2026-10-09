// Limite de requisições em memória do processo (ADR 005): uma lista de horários por chave.
// Serve a uma instância só; com mais de uma instância cada uma conta separado.

export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitResult = { ok: boolean; retryAfterSec: number };

/** Limites das rotas públicas. Webhooks não têm limite. */
export const RATE_LIMITS = {
  /** `POST /api/pedidos`: 10 por minuto por IP. */
  createOrder: { limit: 10, windowMs: 60_000 },
  /** `GET` públicos: 120 por minuto por IP (cada rota conta separado). */
  publicGet: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitOptions>;

const MAX_KEYS = 5000;
// Cada chave guarda a própria janela: chaves com janelas diferentes convivem no mesmo mapa.
const buckets = new Map<string, { hits: number[]; windowMs: number }>();

/**
 * Registra uma tentativa para `key` e diz se ela cabe no limite.
 * Tentativa recusada não entra na conta; `retryAfterSec` é o tempo até a mais antiga sair da janela.
 */
export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const recent = (buckets.get(key)?.hits ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, { hits: recent, windowMs });
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  buckets.set(key, { hits: recent, windowMs });
  // Limpeza oportunista para o mapa não crescer sem fim.
  if (buckets.size > MAX_KEYS) {
    for (const [otherKey, bucket] of buckets) {
      if (bucket.hits.every((at) => now - at >= bucket.windowMs)) buckets.delete(otherKey);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Zera os contadores. Só para testes. */
export function resetRateLimits(): void {
  buckets.clear();
}
