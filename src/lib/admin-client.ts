// Cliente das rotas do painel (`/api/admin/**`). Só para componentes de cliente do backoffice.
// Os tipos vêm do serviço por `import type` (nada de `src/server` entra no pacote do navegador);
// no tráfego as datas chegam como texto ISO em UTC e o dinheiro em centavos inteiros.
// Nunca logar respostas: trazem nome, e-mail e telefone de quem contribuiu.
import type {
  AdminListItem,
  AdminMetrics,
  AdminOrder,
  AdminOrderDetail,
  AdminProduct,
  AdminSettings,
} from '@/server/admin.service';
import type { GatewayHealth } from '@/server/gateways/registry';
import { ApiError, NETWORK_ERROR, type ApiErrorDetail } from './api-client';

/** O mesmo tipo do servidor depois de passar pelo JSON: `Date` vira texto ISO. */
type Wire<T> = T extends Date
  ? string
  : T extends (infer Item)[]
    ? Wire<Item>[]
    : T extends object
      ? { [Key in keyof T]: Wire<T[Key]> }
      : T;

export type Order = Wire<AdminOrder>;
export type OrderDetail = Wire<AdminOrderDetail>;
export type Metrics = Wire<AdminMetrics>;
export type Product = Wire<AdminProduct>;
export type Settings = Wire<AdminSettings>;
export type AdminUser = Wire<AdminListItem>;
export type Gateways = GatewayHealth;
export type AdminRole = AdminUser['role'];
export type OrderStatus = Order['status'];
export type OrderMode = Order['mode'];

export type OrderQuery = { q?: string; status?: OrderStatus | ''; mode?: OrderMode | ''; page?: number };
export type OrderPage = { items: Order[]; page: number; pageSize: number; total: number };

export type ProductChanges = Partial<Pick<Product, 'title' | 'description' | 'active'>>;
export type SettingsChanges = Partial<
  Pick<
    Settings,
    | 'goalCents'
    | 'costsCents'
    | 'drawAt'
    | 'drawPublic'
    | 'instagramFather'
    | 'instagramMother'
    | 'publicMessage'
  >
>;
export type InviteInput = { name: string; email: string; role: AdminRole };
export type InviteResult = {
  admin: { id: string; name: string; email: string; role: AdminRole };
  emailSent: boolean;
};

const FALLBACK_MESSAGE = 'Não foi possível concluir agora. Tente novamente.';

/** Promessa que nunca resolve: usada depois de mandar o navegador para outra página. */
const leaving = <T>() => new Promise<T>(() => undefined);

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
    retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

/**
 * Sessão encerrada (401) volta para o login; troca de senha pendente (403) vai para a tela de
 * troca. Nos dois casos a promessa fica pendente: a página está saindo e não há o que mostrar.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({ status: 0, code: NETWORK_ERROR, message: 'Sem conexão. Tente novamente.' });
  }
  if (res.ok) return (await res.json()) as T;

  const error = await toApiError(res);
  if (res.status === 401) {
    window.location.assign('/admin');
    return leaving<T>();
  }
  if (res.status === 403 && error.code === 'PASSWORD_CHANGE_REQUIRED') {
    window.location.assign('/admin/trocar-senha');
    return leaving<T>();
  }
  throw error;
}

const send = (method: 'POST' | 'PATCH', body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

const id = (value: string) => encodeURIComponent(value);

/** Requisição cancelada de propósito (`AbortController`): não é erro para mostrar. */
export const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Mensagem pronta para a tela a partir de qualquer erro do cliente. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.details?.[0]?.message;
    return detail && error.code === 'VALIDATION_ERROR' ? detail : error.message;
  }
  return FALLBACK_MESSAGE;
}

function orderSearch(query: OrderQuery, withPage: boolean): string {
  const params = new URLSearchParams();
  const q = query.q?.trim();
  if (q) params.set('q', q);
  if (query.status) params.set('status', query.status);
  if (query.mode) params.set('mode', query.mode);
  if (withPage && query.page && query.page > 1) params.set('page', String(query.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}

// --- Métricas e pedidos ----------------------------------------------------------------------

export function fetchMetrics(signal?: AbortSignal): Promise<Metrics> {
  return request<Metrics>('/api/admin/metricas', { signal });
}

export function fetchOrders(query: OrderQuery = {}, signal?: AbortSignal): Promise<OrderPage> {
  return request<OrderPage>(`/api/admin/pedidos${orderSearch(query, true)}`, { signal });
}

export async function fetchOrder(orderId: string, signal?: AbortSignal): Promise<OrderDetail> {
  return (await request<{ order: OrderDetail }>(`/api/admin/pedidos/${id(orderId)}`, { signal })).order;
}

export function refundOrder(orderId: string): Promise<{ changed: boolean; order: OrderDetail }> {
  return request(`/api/admin/pedidos/${id(orderId)}/estornar`, send('POST'));
}

export function resendOrderEmail(orderId: string): Promise<{ emailSent: boolean }> {
  return request(`/api/admin/pedidos/${id(orderId)}/reenviar-email`, send('POST'));
}

/** Endereço do CSV com os mesmos filtros da tela (a página não entra: o arquivo traz tudo). */
export function exportCsvUrl(query: OrderQuery = {}): string {
  return `/api/admin/exportar.csv${orderSearch(query, false)}`;
}

/** Só existe em modo demonstração; fora dele a rota responde 404. */
export function approveDemoOrder(orderId: string): Promise<{ ok: true }> {
  return request('/api/demo/aprovar', send('POST', { orderId }));
}

export function runExpiration(): Promise<{ expired: number }> {
  return request('/api/admin/expirar', send('POST'));
}

// --- Produtos --------------------------------------------------------------------------------

export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  return (await request<{ items: Product[] }>('/api/admin/produtos', { signal })).items;
}

export async function updateProduct(productId: string, changes: ProductChanges): Promise<Product> {
  const path = `/api/admin/produtos/${id(productId)}`;
  return (await request<{ product: Product }>(path, send('PATCH', changes))).product;
}

// --- Configurações ---------------------------------------------------------------------------

export type SettingsResponse = { settings: Settings; gateways: Gateways };

export function fetchSettings(signal?: AbortSignal): Promise<SettingsResponse> {
  return request<SettingsResponse>('/api/admin/configuracoes', { signal });
}

export function updateSettings(changes: SettingsChanges): Promise<SettingsResponse> {
  return request<SettingsResponse>('/api/admin/configuracoes', send('PATCH', changes));
}

// --- Usuários do painel ----------------------------------------------------------------------

export async function fetchAdmins(signal?: AbortSignal): Promise<AdminUser[]> {
  return (await request<{ items: AdminUser[] }>('/api/admin/usuarios', { signal })).items;
}

export function inviteAdmin(input: InviteInput): Promise<InviteResult> {
  return request<InviteResult>('/api/admin/usuarios', send('POST', input));
}

export function resendInvite(adminId: string): Promise<InviteResult> {
  return request<InviteResult>(`/api/admin/usuarios/${id(adminId)}/reenviar-convite`, send('POST'));
}

export async function setAdminActive(adminId: string, active: boolean): Promise<AdminUser> {
  const path = `/api/admin/usuarios/${id(adminId)}`;
  return (await request<{ admin: AdminUser }>(path, send('PATCH', { active }))).admin;
}

// --- Datas e dinheiro na tela ----------------------------------------------------------------

const TIME_ZONE = 'America/Fortaleza';
/** Fortaleza é UTC−3 o ano inteiro (sem horário de verão). */
const FORTALEZA_OFFSET_MS = 3 * 60 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});
const longFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
/** `sexta-feira, 18 de dezembro de 2026 às 19:00`, no horário de Fortaleza. */
export const formatLongDate = (iso: string) => longFormat.format(new Date(iso));

/** ISO UTC → valor de `<input type="datetime-local">` no horário de Fortaleza. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(time - FORTALEZA_OFFSET_MS).toISOString().slice(0, 16);
}

/** Valor de `datetime-local` (horário de Fortaleza) → ISO UTC. Vazio vira `null`; inválido, `undefined`. */
export function localInputToIso(value: string): string | null | undefined {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const time = Date.UTC(year, month - 1, day, hour, minute, second) + FORTALEZA_OFFSET_MS;
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

/** Centavos → texto do campo em reais (`250000` → `2500,00`). */
export function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

/** Campo em reais (`2.500,00`, `2500.5`, `2500`) → centavos inteiros; `null` se não for um valor válido. */
export function inputToCents(value: string): number | null {
  const text = value.replace(/\s|R\$/gi, '');
  if (!text) return null;
  // Com vírgula, ponto é separador de milhar; sem vírgula, ponto é o decimal.
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [reais, decimals = ''] = normalized.split('.');
  const cents = Number(reais) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  EXPIRED: 'Expirado',
  REFUNDED: 'Estornado',
  CANCELED: 'Cancelado',
};

export const modeLabels: Record<OrderMode, string> = {
  NUMBERS: 'Números das cestas',
  EXTRA: 'Colaboração avulsa',
};
