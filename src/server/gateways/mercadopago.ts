import 'server-only';
import { createHmac } from 'node:crypto';
import { timingSafeEqualHex } from '@/server/crypto';
import { AppError, GatewayNotConfiguredError } from '@/server/errors';
import type {
  CreateChargeInput,
  PaymentGateway,
  PixCharge,
  ProviderRef,
  ProviderStatus,
  ProviderStatusValue,
  RefundResult,
  WebhookRequest,
  WebhookVerdict,
} from './types';

// Adapter Mercado Pago (Pix) por HTTP direto, sem SDK (ADR 003).
// Todo campo enviado ou lido aqui foi conferido na documentação oficial em 2026-10-09 e está descrito em
// wiki/integracoes/mercado-pago.md. Não acrescente campo sem conferir na doc e atualizar a wiki.
//
// Segurança: o access token só sai deste arquivo no header Authorization. Nenhuma mensagem de erro
// carrega token, e-mail ou CPF.

const API_BASE = 'https://api.mercadopago.com';
const DEFAULT_TIMEOUT_MS = 15_000;

/** A doc exige vencimento do Pix entre 30 minutos e 30 dias (Orders e Payments). */
const MIN_PIX_EXPIRATION_MINUTES = 30;

/** Tolerância entre o `ts` da assinatura do webhook e o relógio do servidor. */
const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export type MercadoPagoConfig = {
  accessToken?: string;
  webhookSecret?: string;
  flavor: 'orders' | 'payments';
  /** Só para testes. */
  now?: () => Date;
  /** Só para testes. */
  timeoutMs?: number;
};

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** Ids do Mercado Pago chegam como número (Payments) ou string (Orders). */
const asId = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : asString(value);

const firstOf = (value: unknown): Json => asRecord(Array.isArray(value) ? value[0] : undefined);

function gatewayError(detail: string): AppError {
  return new AppError('GATEWAY_ERROR', 'Falha no Mercado Pago: ' + detail, 502);
}

function assertCents(cents: number): void {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error('Valor em centavos inválido para o gateway.');
}

/** Centavos inteiros -> "25.00" (formato da Orders API). */
function centsToDecimalString(cents: number): string {
  assertCents(cents);
  return (cents / 100).toFixed(2);
}

/** "25.00", "25" ou 25 -> 2500. Qualquer outra coisa -> undefined. */
function decimalToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value * 100);
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 100);
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function splitName(name: string): { first: string; last?: string } {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.slice(1).join(' ');
  return last ? { first, last } : { first };
}

/** Item conforme ADR 002. Valores em centavos; cada API converte para o seu formato. */
function buildItem(input: CreateChargeInput): { title: string; quantity: number; unitCents: number } {
  const { order, product, quantity } = input;
  const item =
    product.mode === 'NUMBERS'
      ? { title: `${product.title} — ${quantity} números`, quantity, unitCents: product.unitCents }
      : { title: product.title, quantity: 1, unitCents: order.amountCents };
  assertCents(item.unitCents);
  if (!Number.isInteger(item.quantity) || item.quantity <= 0)
    throw new Error('Quantidade inválida para o gateway.');
  return { ...item, title: item.title.slice(0, 150) };
}

const PAYMENT_STATUS: Record<string, ProviderStatusValue> = {
  approved: 'approved',
  pending: 'pending',
  in_process: 'pending',
  authorized: 'pending',
  in_mediation: 'pending',
  rejected: 'rejected',
  cancelled: 'rejected',
  refunded: 'refunded',
  charged_back: 'refunded',
};

const ORDER_STATUS: Record<string, ProviderStatusValue> = {
  processed: 'approved',
  created: 'pending',
  processing: 'pending',
  action_required: 'pending',
  in_review: 'pending',
  failed: 'rejected',
  canceled: 'rejected',
  expired: 'rejected',
  refunded: 'refunded',
  charged_back: 'refunded',
};

/** Status desconhecido nunca aprova: fica pendente. */
const mapStatus = (table: Record<string, ProviderStatusValue>, status: unknown): ProviderStatusValue =>
  (typeof status === 'string' && Object.hasOwn(table, status) ? table[status] : undefined) ?? 'pending';

export function createMercadoPagoGateway(config: MercadoPagoConfig): PaymentGateway {
  const now = () => (config.now ? config.now() : new Date());
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Remove da mensagem do provedor qualquer coisa que pareça token, e-mail ou documento. */
  function sanitize(message: string): string {
    let clean = message;
    if (config.accessToken) clean = clean.split(config.accessToken).join('[token]');
    return clean
      .replace(/[^\s@"']+@[^\s@"']+/g, '[e-mail]')
      .replace(/\d{11,}/g, '[número]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  function providerMessage(body: unknown): string {
    const record = asRecord(body);
    const firstError = firstOf(record.errors);
    const message =
      asString(record.message) ??
      asString(firstError.message) ??
      asString(firstError.code) ??
      asString(record.error) ??
      'sem detalhe';
    return sanitize(message);
  }

  async function request(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<Json> {
    if (!config.accessToken) throw new GatewayNotConfiguredError();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    };
    if (options.idempotencyKey) headers['X-Idempotency-Key'] = options.idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number;
    let ok: boolean;
    let text: string;
    try {
      const response = await fetch(API_BASE + path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store',
      });
      status = response.status;
      ok = response.ok;
      text = await response.text();
    } catch {
      // O erro original pode carregar a requisição inteira: não é repassado.
      throw gatewayError(controller.signal.aborted ? 'tempo de resposta esgotado.' : 'falha de comunicação.');
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = text === '' ? {} : JSON.parse(text);
    } catch {
      parsed = undefined;
    }

    if (!ok) throw gatewayError(`HTTP ${status} - ${providerMessage(parsed)}`);
    if (parsed === undefined) throw gatewayError(`HTTP ${status} - resposta fora do formato esperado.`);
    return asRecord(parsed);
  }

  /** Vencimento enviado ao provedor: o fim da reserva local, nunca abaixo do mínimo da doc. */
  function providerExpiration(orderExpiresAt: Date): { minutes: number; expiresAt: Date } {
    const nowMs = now().getTime();
    const minutes = Math.max(
      MIN_PIX_EXPIRATION_MINUTES,
      Math.ceil((orderExpiresAt.getTime() - nowMs) / 60_000),
    );
    return { minutes, expiresAt: new Date(nowMs + minutes * 60_000) };
  }

  function payerFields(input: CreateChargeInput): Json {
    const name = splitName(input.payer.name);
    return {
      email: input.payer.email,
      first_name: name.first,
      ...(name.last ? { last_name: name.last } : {}),
      identification: { type: 'CPF', number: input.payer.cpf.replace(/\D/g, '') },
    };
  }

  async function createOrderCharge(input: CreateChargeInput): Promise<PixCharge> {
    const { order } = input;
    const item = buildItem(input);
    const total = centsToDecimalString(order.amountCents);
    const expiration = providerExpiration(order.expiresAt);

    const data = await request('POST', '/v1/orders', {
      idempotencyKey: order.id,
      body: {
        type: 'online',
        external_reference: order.id,
        total_amount: total,
        processing_mode: 'automatic',
        payer: payerFields(input),
        items: [
          { title: item.title, unit_price: centsToDecimalString(item.unitCents), quantity: item.quantity },
        ],
        transactions: {
          payments: [
            {
              amount: total,
              payment_method: { id: 'pix', type: 'bank_transfer' },
              expiration_time: `PT${expiration.minutes}M`,
            },
          ],
        },
      },
    });

    const payment = firstOf(asRecord(data.transactions).payments);
    const method = asRecord(payment.payment_method);
    const qrCode = asString(method.qr_code);
    const qrCodeBase64 = asString(method.qr_code_base64);
    // Criação assíncrona (order em `processing`) ou conta sem chave Pix: sem QR não há o que mostrar.
    if (!qrCode || !qrCodeBase64) throw gatewayError('a cobrança foi criada sem os dados do Pix.');

    return {
      providerOrderId: asId(data.id),
      providerPaymentId: asId(payment.id),
      qrCode,
      qrCodeBase64,
      ticketUrl: asString(method.ticket_url),
      expiresAt: parseDate(payment.date_of_expiration) ?? expiration.expiresAt,
      raw: data,
    };
  }

  async function createPaymentCharge(input: CreateChargeInput): Promise<PixCharge> {
    const { order } = input;
    const item = buildItem(input);
    assertCents(order.amountCents);
    const expiration = providerExpiration(order.expiresAt);

    const data = await request('POST', '/v1/payments', {
      idempotencyKey: order.id,
      body: {
        transaction_amount: order.amountCents / 100,
        description: item.title,
        payment_method_id: 'pix',
        external_reference: order.id,
        // Formato do exemplo oficial: 2022-11-17T09:37:52.000-04:00 (aqui sempre em UTC).
        date_of_expiration: expiration.expiresAt.toISOString().replace('Z', '+00:00'),
        payer: payerFields(input),
        additional_info: {
          items: [{ title: item.title, quantity: item.quantity, unit_price: item.unitCents / 100 }],
        },
      },
    });

    const transactionData = asRecord(asRecord(data.point_of_interaction).transaction_data);
    const qrCode = asString(transactionData.qr_code);
    const qrCodeBase64 = asString(transactionData.qr_code_base64);
    if (!qrCode || !qrCodeBase64) throw gatewayError('a cobrança foi criada sem os dados do Pix.');

    return {
      providerPaymentId: asId(data.id),
      qrCode,
      qrCodeBase64,
      ticketUrl: asString(transactionData.ticket_url),
      expiresAt: parseDate(data.date_of_expiration) ?? expiration.expiresAt,
      raw: data,
    };
  }

  async function fetchOrderStatus(ref: ProviderRef & { providerOrderId: string }): Promise<ProviderStatus> {
    const data = await request('GET', `/v1/orders/${encodeURIComponent(ref.providerOrderId)}`);
    const payment = firstOf(asRecord(data.transactions).payments);
    const status = mapStatus(ORDER_STATUS, data.status);
    const amountCents =
      (status === 'approved' ? decimalToCents(data.total_paid_amount) : undefined) ??
      decimalToCents(data.total_amount);
    const providerPaymentId = asId(payment.id) ?? ref.providerPaymentId;
    if (amountCents === undefined || !providerPaymentId) {
      throw gatewayError('a consulta voltou sem valor ou sem pagamento.');
    }
    return {
      status,
      amountCents,
      providerPaymentId,
      externalReference: asString(data.external_reference),
      raw: data,
    };
  }

  async function fetchPaymentStatus(providerPaymentId: string): Promise<ProviderStatus> {
    const data = await request('GET', `/v1/payments/${encodeURIComponent(providerPaymentId)}`);
    const amountCents = decimalToCents(data.transaction_amount);
    if (amountCents === undefined) throw gatewayError('a consulta voltou sem valor.');
    return {
      status: mapStatus(PAYMENT_STATUS, data.status),
      amountCents,
      providerPaymentId: asId(data.id) ?? providerPaymentId,
      externalReference: asString(data.external_reference),
      raw: data,
    };
  }

  return {
    id: 'mercadopago',

    isConfigured: () => Boolean(config.accessToken && config.webhookSecret),

    createPixCharge(input: CreateChargeInput): Promise<PixCharge> {
      return config.flavor === 'payments' ? createPaymentCharge(input) : createOrderCharge(input);
    },

    // Escolhe a API pela referência guardada, não pelo MP_API_FLAVOR do momento: uma cobrança criada
    // pela Orders API continua sendo consultada (e estornada) pela Orders API.
    async fetchStatus(ref: ProviderRef): Promise<ProviderStatus> {
      if (ref.providerOrderId) return fetchOrderStatus({ ...ref, providerOrderId: ref.providerOrderId });
      if (ref.providerPaymentId) return fetchPaymentStatus(ref.providerPaymentId);
      throw gatewayError('consulta sem referência do pagamento.');
    },

    async verifyWebhook(req: WebhookRequest): Promise<WebhookVerdict> {
      if (!config.webhookSecret) return { ok: false, reason: 'not-configured' };

      const signature = req.headers.get('x-signature');
      if (!signature) return { ok: false, reason: 'missing-signature' };
      const requestId = req.headers.get('x-request-id');
      if (!requestId) return { ok: false, reason: 'missing-request-id' };

      let ts: string | undefined;
      let v1: string | undefined;
      for (const part of signature.split(',')) {
        const separator = part.indexOf('=');
        if (separator === -1) continue;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
      }
      if (!ts || !v1 || !/^\d+$/.test(ts)) return { ok: false, reason: 'malformed-signature' };

      let query: URLSearchParams;
      try {
        query = new URL(req.url).searchParams;
      } catch {
        return { ok: false, reason: 'malformed-url' };
      }
      const queryId = query.get('data.id') || undefined;

      // Manifest da doc: "id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];".
      // `data.id` vem da query, em minúsculas; se não vier, o trecho sai do manifest.
      const manifest = (queryId ? `id:${queryId.toLowerCase()};` : '') + `request-id:${requestId};ts:${ts};`;
      const expected = createHmac('sha256', config.webhookSecret).update(manifest).digest('hex');
      if (!timingSafeEqualHex(expected, v1.toLowerCase())) return { ok: false, reason: 'invalid-signature' };

      // A doc fala em milissegundos; há exemplo oficial em segundos. Menos de 12 dígitos = segundos.
      const tsMs = ts.length < 12 ? Number(ts) * 1000 : Number(ts);
      if (Math.abs(now().getTime() - tsMs) > WEBHOOK_TOLERANCE_MS)
        return { ok: false, reason: 'stale-timestamp' };

      // Do corpo só saem o id (quando a query não traz) e o tópico. Status do corpo nunca é lido:
      // a rota consulta o provedor com `fetchStatus`.
      let body: Json = {};
      try {
        body = asRecord(JSON.parse(req.rawBody));
      } catch {
        body = {};
      }
      const id = queryId ?? asId(asRecord(body.data).id);
      if (!id) return { ok: false, reason: 'missing-data-id' };

      const topic =
        (query.get('type') || undefined) ??
        asString(body.type) ??
        (/^\d+$/.test(id) ? 'payment' : /^ord/i.test(id) ? 'order' : undefined);

      // Tópico `order` (Orders API): data.id é o id da order. Tópico `payment`: é o id do pagamento.
      if (topic === 'order') return { ok: true, eventId: requestId, ref: { providerOrderId: id } };
      if (topic === 'payment') return { ok: true, eventId: requestId, ref: { providerPaymentId: id } };
      return { ok: false, reason: 'unsupported-topic' };
    },

    async refund(ref: ProviderRef, amountCents?: number): Promise<RefundResult> {
      if (amountCents !== undefined) assertCents(amountCents);
      const keySuffix = amountCents === undefined ? 'full' : String(amountCents);

      if (ref.providerOrderId) {
        let body: Json | undefined;
        if (amountCents !== undefined) {
          if (!ref.providerPaymentId) throw gatewayError('estorno parcial sem referência do pagamento.');
          body = { transactions: [{ id: ref.providerPaymentId, amount: centsToDecimalString(amountCents) }] };
        }
        const data = await request('POST', `/v1/orders/${encodeURIComponent(ref.providerOrderId)}/refund`, {
          idempotencyKey: `refund-${ref.providerOrderId}-${keySuffix}`,
          body,
        });
        const refund = firstOf(asRecord(data.transactions).refunds);
        return { ok: true, providerRefundId: asId(refund.id), raw: data };
      }

      if (ref.providerPaymentId) {
        const data = await request(
          'POST',
          `/v1/payments/${encodeURIComponent(ref.providerPaymentId)}/refunds`,
          {
            idempotencyKey: `refund-${ref.providerPaymentId}-${keySuffix}`,
            body: amountCents === undefined ? undefined : { amount: amountCents / 100 },
          },
        );
        return { ok: true, providerRefundId: asId(data.id), raw: data };
      }

      throw gatewayError('estorno sem referência do pagamento.');
    },
  };
}
