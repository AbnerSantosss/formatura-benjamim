import 'server-only';
import { env, isDemo } from '@/server/env';
import { GatewayNotConfiguredError } from '@/server/errors';
import { demoGateway } from './demo';
import { fastpayGateway } from './fastpay';
import { ironpayGateway } from './ironpay';
import { mercadoPagoGateway } from './mercadopago';
import { GATEWAY_IDS, type GatewayId, type PaymentGateway } from './types';

// Registro dos gateways (ADR 003). Regras:
// - o gateway ativo vem de PAYMENT_GATEWAY; se não estiver configurado, erro 503 (GATEWAY_NOT_CONFIGURED);
// - o `demo` só existe com DEMO_MODE=true fora de produção; NUNCA há queda automática para ele.

const gateways: Record<GatewayId, PaymentGateway> = {
  mercadopago: mercadoPagoGateway,
  fastpay: fastpayGateway,
  ironpay: ironpayGateway,
  demo: demoGateway,
};

function isGatewayId(id: string): id is GatewayId {
  return (GATEWAY_IDS as readonly string[]).includes(id);
}

/**
 * Adapter pelo id, para as rotas de webhook e de estorno (o pedido guarda o gateway em que foi criado,
 * que pode não ser mais o ativo). Não exige `isConfigured()`: sem chaves o próprio adapter recusa.
 * O `demo` fora de `isDemo` e ids desconhecidos lançam `GatewayNotConfiguredError`.
 */
export function getGatewayById(id: string): PaymentGateway {
  const normalized = id.toLowerCase();
  if (!isGatewayId(normalized)) throw new GatewayNotConfiguredError();
  if (normalized === 'demo' && !isDemo) throw new GatewayNotConfiguredError();
  return gateways[normalized];
}

/** Gateway ativo (PAYMENT_GATEWAY), pronto para criar cobrança. */
export function getGateway(): PaymentGateway {
  const gateway = getGatewayById(env.PAYMENT_GATEWAY);
  if (!gateway.isConfigured()) throw new GatewayNotConfiguredError();
  return gateway;
}

export type GatewayHealth = {
  active: GatewayId;
  configured: boolean;
  others: Partial<Record<GatewayId, boolean>>;
};

/** Situação dos gateways para o painel. Só booleanos: nunca valores de chave. */
export function gatewayHealth(): GatewayHealth {
  const active = env.PAYMENT_GATEWAY;
  const configuredOf = (id: GatewayId) => (id === 'demo' ? isDemo : gateways[id].isConfigured());
  const others: Partial<Record<GatewayId, boolean>> = {};
  for (const id of GATEWAY_IDS) {
    if (id !== active) others[id] = configuredOf(id);
  }
  return { active, configured: configuredOf(active), others };
}
