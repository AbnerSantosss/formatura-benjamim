import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  centsToInput,
  errorMessage,
  exportCsvUrl,
  fetchMetrics,
  fetchOrders,
  inputToCents,
  isoToLocalInput,
  localInputToIso,
  updateProduct,
} from '@/lib/admin-client';
import { ApiError, NETWORK_ERROR } from '@/lib/api-client';

// O cliente do painel roda no navegador; aqui `fetch` e `window.location` são dublês.
const assign = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** `true` se a promessa não resolveu nem rejeitou depois de esvaziar a fila de microtarefas. */
async function staysPending(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol('pendente');
  const settled = promise.then(
    () => 'resolveu',
    () => 'rejeitou',
  );
  const winner = await Promise.race([
    settled,
    new Promise((resolve) => setTimeout(() => resolve(marker), 20)),
  ]);
  return winner === marker;
}

beforeEach(() => {
  assign.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { assign } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin-client: sessão e troca de senha', () => {
  it('401 manda o navegador para o login e deixa a promessa pendente', async () => {
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHENTICATED', message: 'Sessão encerrada.' }));
    const pending = fetchMetrics();
    expect(await staysPending(pending)).toBe(true);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/admin');
  });

  it('403 PASSWORD_CHANGE_REQUIRED manda para a troca de senha e deixa a promessa pendente', async () => {
    fetchMock.mockResolvedValue(json(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Troque a senha.' }));
    const pending = fetchMetrics();
    expect(await staysPending(pending)).toBe(true);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/admin/trocar-senha');
  });

  it('403 por outro motivo vira erro para a tela, sem redirecionar', async () => {
    fetchMock.mockResolvedValue(
      json(403, { code: 'FORBIDDEN', message: 'Só o proprietário pode fazer isso.' }),
    );
    const error = await fetchMetrics().catch((issue: unknown) => issue);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(errorMessage(error)).toBe('Só o proprietário pode fazer isso.');
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('admin-client: erros e requisições', () => {
  it('resposta de erro sem JSON usa a mensagem padrão e o código UNKNOWN', async () => {
    fetchMock.mockResolvedValue(new Response('<html>erro</html>', { status: 502 }));
    const error = await fetchMetrics().catch((issue: unknown) => issue);
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN' });
    expect(errorMessage(error)).toBe('Não foi possível concluir agora. Tente novamente.');
  });

  it('429 leva os segundos do Retry-After', async () => {
    fetchMock.mockResolvedValue(
      json(429, { code: 'RATE_LIMITED', message: 'Aguarde um pouco.' }, { 'Retry-After': '42' }),
    );
    const error = await fetchMetrics().catch((issue: unknown) => issue);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSec: 42 });
  });

  it('erro de validação mostra a mensagem do primeiro campo', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        details: [{ path: 'title', message: 'Informe o título.' }],
      }),
    );
    const error = await updateProduct('cestas-boticario', { title: '' }).catch((issue: unknown) => issue);
    expect(errorMessage(error)).toBe('Informe o título.');
  });

  it('falha de rede vira NETWORK_ERROR; cancelamento passa adiante como AbortError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const offline = await fetchMetrics().catch((issue: unknown) => issue);
    expect(offline).toMatchObject({ status: 0, code: NETWORK_ERROR });

    fetchMock.mockRejectedValueOnce(new DOMException('cancelada', 'AbortError'));
    const aborted = await fetchMetrics().catch((issue: unknown) => issue);
    expect(aborted).toBeInstanceOf(DOMException);
    expect((aborted as DOMException).name).toBe('AbortError');
  });

  it('erro que não veio da API usa a mensagem padrão', () => {
    expect(errorMessage(new Error('qualquer coisa'))).toBe(
      'Não foi possível concluir agora. Tente novamente.',
    );
  });

  it('salvar produto envia PATCH em JSON, com o código do produto codificado na URL', async () => {
    fetchMock.mockResolvedValue(json(200, { product: { id: 'a/b', title: 'Novo título' } }));
    const saved = await updateProduct('a/b', { title: 'Novo título', active: false });
    expect(saved).toMatchObject({ id: 'a/b', title: 'Novo título' });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/admin/produtos/a%2Fb');
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'same-origin', cache: 'no-store' });
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'Novo título', active: false });
  });

  it('filtros de pedidos viram query string; a página só entra na listagem, não no CSV', async () => {
    fetchMock.mockImplementation(async () => json(200, { items: [], page: 1, pageSize: 20, total: 0 }));
    await fetchOrders({ q: '  maria ', status: 'APPROVED', mode: '', page: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/pedidos?q=maria&status=APPROVED&page=2');

    await fetchOrders({ page: 1 });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/pedidos');

    expect(exportCsvUrl({ q: 'maria', mode: 'EXTRA', page: 3 })).toBe(
      '/api/admin/exportar.csv?q=maria&mode=EXTRA',
    );
    expect(exportCsvUrl()).toBe('/api/admin/exportar.csv');
  });
});

describe('admin-client: dinheiro e datas dos formulários', () => {
  it('converte reais digitados em centavos inteiros', () => {
    expect(inputToCents('2.500,00')).toBe(250000);
    expect(inputToCents('2500.5')).toBe(250050);
    expect(inputToCents('2500')).toBe(250000);
    expect(inputToCents('R$ 0,05')).toBe(5);
    expect(inputToCents('')).toBeNull();
    expect(inputToCents('abc')).toBeNull();
    expect(inputToCents('10,999')).toBeNull();
    expect(inputToCents('-5')).toBeNull();
  });

  it('mostra centavos como texto do campo', () => {
    expect(centsToInput(250000)).toBe('2500,00');
    expect(centsToInput(5)).toBe('0,05');
    expect(centsToInput(1050)).toBe('10,50');
  });

  it('converte entre ISO em UTC e o campo de data no horário de Fortaleza (UTC−3)', () => {
    expect(isoToLocalInput('2026-12-18T22:00:00.000Z')).toBe('2026-12-18T19:00');
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('isto não é data')).toBe('');
    expect(localInputToIso('2026-12-18T19:00')).toBe('2026-12-18T22:00:00.000Z');
    // Perto da meia-noite o dia muda em UTC.
    expect(localInputToIso('2026-12-31T23:30')).toBe('2027-01-01T02:30:00.000Z');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('18/12/2026')).toBeUndefined();
  });
});
