import 'server-only';
import { isDemo } from '@/server/env';
import { GatewayNotConfiguredError } from '@/server/errors';
import type {
  CreateChargeInput,
  PaymentGateway,
  PixCharge,
  ProviderRef,
  ProviderStatus,
  ProviderStatusValue,
  RefundResult,
  WebhookVerdict,
} from './types';

// Gateway de demonstração: nenhuma chamada de rede, nenhum dinheiro.
// Só funciona com DEMO_MODE=true fora de produção (`isDemo`); o registro recusa qualquer outro caso.

/** PNG transparente de 1x1 pixel. */
export const DEMO_QR_CODE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

type DemoCharge = { amountCents: number; status: ProviderStatusValue };

// Em `next dev` o módulo é recarregado a cada alteração; o Map fica no globalThis para sobreviver.
const globalForDemo = globalThis as unknown as { benjamimDemoCharges?: Map<string, DemoCharge> };
const charges = (globalForDemo.benjamimDemoCharges ??= new Map<string, DemoCharge>());

const paymentIdOf = (orderId: string) => 'DEMO-PAY-' + orderId;

function assertDemo(): void {
  if (!isDemo) throw new GatewayNotConfiguredError();
}

function orderIdOf(ref: ProviderRef): string {
  if (ref.providerOrderId) return ref.providerOrderId;
  if (ref.providerPaymentId?.startsWith('DEMO-PAY-')) return ref.providerPaymentId.slice('DEMO-PAY-'.length);
  throw new GatewayNotConfiguredError('Cobrança de demonstração sem referência.');
}

/**
 * Marca a cobrança de demonstração como paga. Chamada pela rota `demo/aprovar` (só em `isDemo`).
 * `amountCents` só é necessário quando a cobrança não está mais em memória (servidor reiniciado).
 */
export function demoApprove(orderId: string, amountCents?: number): void {
  assertDemo();
  const current = charges.get(orderId);
  charges.set(orderId, { amountCents: amountCents ?? current?.amountCents ?? 0, status: 'approved' });
}

/** Limpa o estado em memória. Só para testes. */
export function demoReset(): void {
  charges.clear();
}

export const demoGateway: PaymentGateway = {
  id: 'demo',

  isConfigured: () => isDemo,

  async createPixCharge(input: CreateChargeInput): Promise<PixCharge> {
    assertDemo();
    const { order } = input;
    // Repetir a criação não desfaz uma aprovação já simulada.
    if (!charges.has(order.id)) charges.set(order.id, { amountCents: order.amountCents, status: 'pending' });
    return {
      providerOrderId: order.id,
      providerPaymentId: paymentIdOf(order.id),
      qrCode: 'DEMO-' + order.id,
      qrCodeBase64: DEMO_QR_CODE_BASE64,
      expiresAt: order.expiresAt,
      raw: { demo: true },
    };
  },

  async fetchStatus(ref: ProviderRef): Promise<ProviderStatus> {
    assertDemo();
    const orderId = orderIdOf(ref);
    const charge = charges.get(orderId);
    return {
      status: charge?.status ?? 'pending',
      amountCents: charge?.amountCents ?? 0,
      providerPaymentId: paymentIdOf(orderId),
      externalReference: orderId,
      raw: { demo: true },
    };
  },

  async verifyWebhook(): Promise<WebhookVerdict> {
    return { ok: false, reason: 'demo' };
  },

  async refund(ref: ProviderRef): Promise<RefundResult> {
    assertDemo();
    const orderId = orderIdOf(ref);
    const charge = charges.get(orderId);
    if (charge) charges.set(orderId, { ...charge, status: 'refunded' });
    return { ok: true, providerRefundId: 'DEMO-REFUND-' + orderId, raw: { demo: true } };
  },
};
