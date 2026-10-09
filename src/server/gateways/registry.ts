import 'server-only';
import { CONFIGURABLE_GATEWAY_IDS, GATEWAY_DEFS, type ConfigurableGatewayId } from '@/domain/gateway-fields';
import { env, isDemo } from '@/server/env';
import { GatewayNotConfiguredError } from '@/server/errors';
import { demoGateway } from './demo';
import { createFastPayGateway } from './fastpay';
import { createIronPayGateway } from './ironpay';
import { createMercadoPagoGateway } from './mercadopago';
import { loadStoredGateways, type GatewayFieldValues, type StoredGateways } from './stored-config';
import { GATEWAY_IDS, type GatewayId, type PaymentGateway } from './types';

// Registro dos gateways (ADR 003 e ADR 015). Regras:
// - o gateway ativo é o escolhido no painel; sem escolha, vale PAYMENT_GATEWAY;
// - cada credencial vem do painel (banco, cifrada); se o campo não foi salvo lá, vale a variável de ambiente;
// - gateway ativo sem credenciais = erro 503 (GATEWAY_NOT_CONFIGURED);
// - com o modo demonstração ligado no painel (`Campaign.demoMode`, ADR 016) o gateway ativo é o `demo`,
//   em qualquer ambiente; é uma escolha explícita do dono, nunca uma queda automática;
// - fora disso o `demo` só existe com DEMO_MODE=true fora de produção.

function isGatewayId(id: string): id is GatewayId {
  return (GATEWAY_IDS as readonly string[]).includes(id);
}

/** Credenciais vindas das variáveis de ambiente, nos mesmos nomes de campo do painel. */
export function envGatewayFields(id: ConfigurableGatewayId): GatewayFieldValues {
  const raw: Record<string, string | undefined> =
    id === 'mercadopago'
      ? {
          accessToken: env.MP_ACCESS_TOKEN,
          webhookSecret: env.MP_WEBHOOK_SECRET,
          publicKey: env.MP_PUBLIC_KEY,
        }
      : id === 'fastpay'
        ? {
            apiUrl: env.FASTPAY_API_URL,
            apiKey: env.FASTPAY_API_KEY,
            webhookSecret: env.FASTPAY_WEBHOOK_SECRET,
          }
        : {
            apiUrl: env.IRONPAY_API_URL,
            apiKey: env.IRONPAY_API_KEY,
            webhookSecret: env.IRONPAY_WEBHOOK_SECRET,
          };
  const fields: GatewayFieldValues = {};
  for (const [name, value] of Object.entries(raw)) if (value) fields[name] = value;
  return fields;
}

function build(id: ConfigurableGatewayId, stored: StoredGateways): PaymentGateway {
  return buildWith(id, stored.fields[id]);
}

/** Teria credenciais suficientes com estes campos do painel? Usado antes de ativar um gateway. */
export function isGatewayConfiguredWith(id: ConfigurableGatewayId, panelFields: GatewayFieldValues): boolean {
  return buildWith(id, panelFields).isConfigured();
}

function buildWith(id: ConfigurableGatewayId, panelFields: GatewayFieldValues): PaymentGateway {
  const fields = { ...envGatewayFields(id), ...panelFields };
  if (id === 'mercadopago') {
    return createMercadoPagoGateway({
      accessToken: fields.accessToken,
      webhookSecret: fields.webhookSecret,
      flavor: env.MP_API_FLAVOR,
    });
  }
  const config = { apiUrl: fields.apiUrl, apiKey: fields.apiKey, webhookSecret: fields.webhookSecret };
  return id === 'fastpay' ? createFastPayGateway(config) : createIronPayGateway(config);
}

function resolve(id: string, stored: StoredGateways): PaymentGateway {
  const normalized = id.toLowerCase();
  if (!isGatewayId(normalized)) throw new GatewayNotConfiguredError();
  if (normalized === 'demo') {
    if (!demoAllowedWith(stored)) throw new GatewayNotConfiguredError();
    return demoGateway;
  }
  return build(normalized, stored);
}

/** O gateway `demo` pode ser usado: chave do painel ligada ou DEMO_MODE=true fora de produção. */
const demoAllowedWith = (stored: StoredGateways): boolean => stored.demoMode === true || isDemo;

const activeId = (stored: StoredGateways): GatewayId =>
  stored.demoMode === true ? 'demo' : (stored.active ?? env.PAYMENT_GATEWAY);

/** Chave "modo demonstração" do painel: textos de teste nas páginas públicas e Pix simulado. */
export async function demoModeOn(): Promise<boolean> {
  return (await loadStoredGateways()).demoMode === true;
}

/** Simulações (aprovar pedido demo, tela de Pix ilustrativo) estão liberadas neste momento? */
export async function demoAllowed(): Promise<boolean> {
  return demoAllowedWith(await loadStoredGateways());
}

/**
 * Adapter pelo id, para as rotas de webhook e de estorno (o pedido guarda o gateway em que foi criado,
 * que pode não ser mais o ativo). Não exige `isConfigured()`: sem chaves o próprio adapter recusa.
 * O `demo` sem demonstração liberada e ids desconhecidos lançam `GatewayNotConfiguredError`.
 */
export async function getGatewayById(id: string): Promise<PaymentGateway> {
  return resolve(id, await loadStoredGateways());
}

/** Gateway ativo, pronto para criar cobrança. */
export async function getGateway(): Promise<PaymentGateway> {
  const stored = await loadStoredGateways();
  const gateway = resolve(activeId(stored), stored);
  if (!gateway.isConfigured()) throw new GatewayNotConfiguredError();
  return gateway;
}

export type GatewayHealth = {
  active: GatewayId;
  configured: boolean;
  others: Partial<Record<GatewayId, boolean>>;
};

/** Situação dos gateways para o painel. Só booleanos: nunca valores de chave. */
export async function gatewayHealth(): Promise<GatewayHealth> {
  const stored = await loadStoredGateways();
  const active = activeId(stored);
  const configuredOf = (id: GatewayId) =>
    id === 'demo' ? demoAllowedWith(stored) : build(id, stored).isConfigured();
  const others: Partial<Record<GatewayId, boolean>> = {};
  for (const id of GATEWAY_IDS) {
    if (id !== active) others[id] = configuredOf(id);
  }
  return { active, configured: configuredOf(active), others };
}

export type GatewayFieldState = {
  name: string;
  /** Preenchido (no painel ou no ambiente). */
  set: boolean;
  source: 'painel' | 'ambiente' | null;
  /** Só para campos que não são segredo. */
  value?: string;
};

export type GatewaySettingsItem = {
  id: ConfigurableGatewayId;
  implemented: boolean;
  configured: boolean;
  active: boolean;
  fields: GatewayFieldState[];
};

export type GatewaySettings = {
  active: GatewayId;
  /** De onde vem a escolha do gateway ativo. */
  activeSource: 'painel' | 'ambiente';
  /** Modo demonstração ligado: nenhum destes gateways é usado enquanto estiver assim. */
  demoMode: boolean;
  gateways: GatewaySettingsItem[];
};

/** Estado detalhado para a tela de gateways. Valor só de campo não secreto. */
export async function gatewaySettings(): Promise<GatewaySettings> {
  const stored = await loadStoredGateways();
  // O gateway real escolhido, mesmo com a demonstração ligada (é o que volta a valer ao desligar).
  const active = stored.active ?? env.PAYMENT_GATEWAY;
  const gateways = CONFIGURABLE_GATEWAY_IDS.map((id): GatewaySettingsItem => {
    const fromEnv = envGatewayFields(id);
    const fromPanel = stored.fields[id];
    const fields = GATEWAY_DEFS[id].fields.map((field): GatewayFieldState => {
      const source = fromPanel[field.name] ? 'painel' : fromEnv[field.name] ? 'ambiente' : null;
      const state: GatewayFieldState = { name: field.name, set: source !== null, source };
      if (!field.secret && source) state.value = fromPanel[field.name] ?? fromEnv[field.name];
      return state;
    });
    return {
      id,
      implemented: GATEWAY_DEFS[id].implemented,
      configured: build(id, stored).isConfigured(),
      active: id === active,
      fields,
    };
  });
  return {
    active,
    activeSource: stored.active ? 'painel' : 'ambiente',
    demoMode: stored.demoMode === true,
    gateways,
  };
}
