import 'server-only';
import { Prisma } from '@prisma/client';
import type { Gateway } from '@prisma/client';
import { formatNumber } from '@/domain/orders';
import { prisma } from '@/server/db';
import { sendEmail } from '@/server/email/send';
import { env } from '@/server/env';
import { GatewayNotConfiguredError, GatewayNotImplementedError } from '@/server/errors';
import { getGatewayById } from '@/server/gateways/registry';
import type { GatewayId, ProviderRef, ProviderStatus } from '@/server/gateways/types';
import { describeError, fail, json, logError, readRawBody } from '@/server/http';
import { applyProviderStatus, type StatusResult } from '@/server/orders.service';

// Sincronização do pedido com o provedor de pagamento: webhooks e consulta de reserva.
// Regra única: o status que muda o pedido vem SEMPRE de `fetchStatus` (consulta server-to-server),
// nunca do corpo do webhook nem de qualquer dado enviado pelo navegador.

/** Intervalo mínimo entre duas consultas de status do mesmo pagamento (rota de status). */
export const STATUS_RECHECK_MS = 30_000;

/** Payload maior que isto não é guardado em `WebhookEvent.payload`. */
const MAX_STORED_PAYLOAD_CHARS = 20_000;

/** Motivos de `verifyWebhook` que só aparecem DEPOIS de a assinatura ter sido validada. */
const IGNORED_AFTER_SIGNATURE = new Set(['missing-data-id', 'unsupported-topic']);

type ApplyOutcome = { result: string; applied: StatusResult | null };

function storedPayload(rawBody: string): Prisma.InputJsonValue {
  if (rawBody.length > MAX_STORED_PAYLOAD_CHARS) return { truncated: true, length: rawBody.length };
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Prisma.InputJsonValue;
  } catch {
    // corpo que não é JSON: guarda só o tamanho
  }
  return { unparsed: true, length: rawBody.length };
}

/**
 * Envia o e-mail "pedido confirmado" ao contribuinte de um pedido APPROVED. Chamar sempre DEPOIS do
 * commit que aprovou o pedido. Nunca lança (falha de e-mail não pode derrubar webhook nem painel):
 * devolve `false` se o pedido não existe, não está aprovado ou o envio falhou.
 */
export async function sendOrderConfirmedEmail(orderId: string): Promise<boolean> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        publicToken: true,
        amountCents: true,
        product: { select: { title: true } },
        contributor: { select: { name: true, email: true } },
        numbers: { where: { active: true }, select: { number: true }, orderBy: { number: 'asc' } },
      },
    });
    if (!order || order.status !== 'APPROVED') return false;
    const campaign = await prisma.campaign.findUnique({ where: { id: 'main' }, select: { drawAt: true } });

    const site = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
    const { ok } = await sendEmail('pedido-confirmado', order.contributor.email, {
      nome: order.contributor.name,
      valorCentavos: order.amountCents,
      produto: order.product.title,
      numeros: order.numbers.map((row) => formatNumber(row.number)),
      linkObrigado: `${site}/obrigado/${order.id}?t=${encodeURIComponent(order.publicToken)}`,
      dataSorteio: campaign?.drawAt ?? null,
    });
    return ok;
  } catch (error) {
    logError('email', error);
    return false;
  }
}

/**
 * Aplica ao pedido o status conferido no provedor. O pedido é localizado por `externalReference`
 * (= `Order.id`) e precisa ter sido criado no mesmo gateway que respondeu.
 */
async function applyVerifiedStatus(
  gateway: Gateway,
  status: ProviderStatus,
  now: Date,
  expectedOrderId?: string,
): Promise<ApplyOutcome> {
  const orderId = status.externalReference;
  if (!orderId) return { result: 'sem-external-reference', applied: null };
  if (expectedOrderId !== undefined && orderId !== expectedOrderId) {
    return { result: 'external-reference-divergente', applied: null };
  }
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { gateway: true } });
  if (!order) return { result: 'pedido-nao-encontrado', applied: null };
  if (order.gateway !== gateway) return { result: 'gateway-divergente', applied: null };
  // "Ainda pendente" não muda nada: não vale uma linha de auditoria a cada consulta.
  if (status.status === 'pending') return { result: 'pending', applied: null };

  const applied = await applyProviderStatus(
    {
      orderId,
      providerPaymentId: status.providerPaymentId,
      status: status.status,
      amountCents: status.amountCents,
    },
    { now },
  );
  if (applied.changed && applied.status === 'APPROVED') {
    // Fora da transação (já confirmada em `applyProviderStatus`); falha de e-mail não propaga.
    await sendOrderConfirmedEmail(orderId);
  }
  return {
    result: `${status.status}:${applied.status}${applied.changed ? ':changed' : ''}`,
    applied,
  };
}

/**
 * Trata o webhook de um gateway:
 * 1. valida a assinatura sobre o corpo cru (401 se inválida; 503 se o adapter não existe ou não tem chave);
 * 2. grava `WebhookEvent` (único por gateway + eventId); repetição responde 200 sem reprocessar;
 * 3. consulta o provedor e aplica o status. Depois de gravado o evento a resposta é sempre 200:
 *    falha fica em `WebhookEvent.result` e o pedido é reconciliado pela consulta de status.
 */
export async function handleWebhook(gatewayId: Exclude<GatewayId, 'demo'>, req: Request): Promise<Response> {
  const gatewayEnum = gatewayId.toUpperCase() as Gateway;

  let gateway;
  let rawBody: string;
  let verdict;
  try {
    gateway = await getGatewayById(gatewayId);
    rawBody = await readRawBody(req);
    verdict = await gateway.verifyWebhook({ headers: req.headers, url: req.url, rawBody });
  } catch (error) {
    return fail(error);
  }

  if (!verdict.ok) {
    if (verdict.reason === 'not-implemented') return fail(new GatewayNotImplementedError());
    if (verdict.reason === 'not-configured') return fail(new GatewayNotConfiguredError());
    // Assinatura válida, mas notificação de um assunto que não tratamos: 200 para o provedor não reenviar.
    if (IGNORED_AFTER_SIGNATURE.has(verdict.reason)) return json({ received: true, ignored: true });
    return json({ code: 'INVALID_SIGNATURE', message: 'Assinatura inválida.' }, { status: 401 });
  }

  let event: { id: string };
  try {
    event = await prisma.webhookEvent.create({
      data: { gateway: gatewayEnum, eventId: verdict.eventId, payload: storedPayload(rawBody) },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return json({ received: true, duplicate: true });
    }
    // Evento não gravado: erro de verdade, para o provedor reenviar.
    return fail(error);
  }

  try {
    const now = new Date();
    const status = await gateway.fetchStatus(verdict.ref);
    const { result } = await applyVerifiedStatus(gatewayEnum, status, now);
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: now, result } });
  } catch (error) {
    logError(`webhook:${gatewayId}`, error);
    try {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { result: `error: ${describeError(error)}` },
      });
    } catch (updateError) {
      logError(`webhook:${gatewayId}`, updateError);
    }
  }
  return json({ received: true });
}

/**
 * Reserva para webhook atrasado: consulta o provedor sobre a cobrança mais recente do pedido,
 * no máximo uma vez a cada `STATUS_RECHECK_MS`, e aplica o status. Nunca lança: falha de consulta
 * não pode derrubar a tela de pagamento. Devolve `true` se chegou a consultar o provedor.
 */
export async function refreshPendingOrder(orderId: string, now: Date): Promise<boolean> {
  try {
    const payment = await prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, gateway: true, providerOrderId: true, providerPaymentId: true },
    });
    if (!payment || (!payment.providerOrderId && !payment.providerPaymentId)) return false;

    // Marca a consulta antes de fazê-la: de várias abas consultando ao mesmo tempo, só uma vai ao provedor.
    const claimed = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - STATUS_RECHECK_MS) } }],
      },
      data: { lastCheckedAt: now },
    });
    if (claimed.count === 0) return false;

    const ref: ProviderRef = {
      providerOrderId: payment.providerOrderId ?? undefined,
      providerPaymentId: payment.providerPaymentId ?? undefined,
    };
    const status = await (await getGatewayById(payment.gateway)).fetchStatus(ref);
    await applyVerifiedStatus(payment.gateway, status, now, orderId);
    return true;
  } catch (error) {
    logError('status', error);
    return false;
  }
}
