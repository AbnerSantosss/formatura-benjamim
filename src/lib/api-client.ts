// Cliente das rotas públicas de API. Pode ser importado por componentes de cliente: não usa nada de
// `src/server`. Datas chegam como texto ISO em UTC. Nunca logar corpo de pedido (tem CPF e contato).
import type { NewOrderInput, OrderStatus } from '@/domain/types';

export type CreatedOrderResponse = {
  orderId: string;
  publicToken: string;
  /** ISO 8601 em UTC. */
  expiresAt: string;
  status: OrderStatus;
  pix: { qrCode: string | null; qrCodeBase64: string | null; ticketUrl: string | null };
};

export type OrderStatusResponse = {
  status: OrderStatus;
  /** ISO 8601 em UTC. */
  expiresAt: string;
  approvedAt: string | null;
};

export type ApiErrorDetail = { path: string; message: string };

/** Código usado quando a requisição nem chegou a ter resposta (rede fora, servidor inacessível). */
export const NETWORK_ERROR = 'NETWORK_ERROR';
const FALLBACK_MESSAGE = 'Não foi possível concluir agora. Tente novamente.';

/** Erro de API no formato `{ code, message, details? }`; `numbers` vem no conflito `NUMBERS_TAKEN`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly numbers?: number[];
  /** Segundos do cabeçalho `Retry-After`, quando a resposta trouxe. */
  readonly retryAfterSec?: number;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    numbers?: number[];
    retryAfterSec?: number;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.numbers = init.numbers;
    this.retryAfterSec = init.retryAfterSec;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

async function toApiError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    // Resposta sem JSON (ex.: página de erro do proxy): fica só o status.
  }
  const retryAfter = Number(res.headers.get('Retry-After'));
  return new ApiError({
    status: res.status,
    code: typeof body.code === 'string' ? body.code : 'UNKNOWN',
    message: typeof body.message === 'string' && body.message ? body.message : FALLBACK_MESSAGE,
    details: Array.isArray(body.details) ? (body.details as ApiErrorDetail[]) : undefined,
    numbers: Array.isArray(body.numbers)
      ? body.numbers.filter((value): value is number => Number.isInteger(value))
      : undefined,
    retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError({ status: 0, code: NETWORK_ERROR, message: FALLBACK_MESSAGE });
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Números reservados ou confirmados agora (`GET /api/numeros/ocupados`). */
export async function fetchOccupied(signal?: AbortSignal): Promise<number[]> {
  const data = await request<{ occupied: number[] }>('/api/numeros/ocupados', { signal });
  return Array.isArray(data.occupied) ? data.occupied : [];
}

/** Cria o pedido e a cobrança Pix (`POST /api/pedidos`). Reenviar a mesma chave devolve o mesmo pedido. */
export function createOrder(input: NewOrderInput): Promise<CreatedOrderResponse> {
  return request<CreatedOrderResponse>('/api/pedidos', postJson(input));
}

/** Status público do pedido (`GET /api/pedidos/[id]/status?t=`). Token errado responde 404. */
export function fetchOrderStatus(
  orderId: string,
  publicToken: string,
  signal?: AbortSignal,
): Promise<OrderStatusResponse> {
  const path = `/api/pedidos/${encodeURIComponent(orderId)}/status?t=${encodeURIComponent(publicToken)}`;
  return request<OrderStatusResponse>(path, { signal });
}

/** Aprovação simulada (`POST /api/demo/aprovar`). Fora do modo demonstração a rota responde 404. */
export function approveDemoOrder(orderId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/demo/aprovar', postJson({ orderId }));
}
