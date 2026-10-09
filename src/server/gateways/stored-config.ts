import 'server-only';
import type { Gateway } from '@prisma/client';
import { CONFIGURABLE_GATEWAY_IDS, GATEWAY_DEFS, type ConfigurableGatewayId } from '@/domain/gateway-fields';
import { decryptGatewaySecrets, encryptGatewaySecrets } from '@/server/crypto';
import { prisma } from '@/server/db';

// Configuração de gateway salva pelo painel (tabela `GatewayConfig` + `Campaign.activeGateway`).
// Único arquivo que decifra as credenciais. Nada daqui vai para log nem para resposta de API.

const CAMPAIGN_ID = 'main';
/** As rotas de pagamento leem a cada pedido; o cache evita duas consultas por requisição. */
const CACHE_MS = 10_000;

export type GatewayFieldValues = Record<string, string>;

export type StoredGateways = {
  /** Gateway escolhido no painel; `null` = vale PAYMENT_GATEWAY. */
  active: ConfigurableGatewayId | null;
  fields: Record<ConfigurableGatewayId, GatewayFieldValues>;
};

const toId = (gateway: Gateway): ConfigurableGatewayId | null => {
  const id = gateway.toLowerCase();
  return (CONFIGURABLE_GATEWAY_IDS as readonly string[]).includes(id) ? (id as ConfigurableGatewayId) : null;
};

export const toGatewayEnum = (id: ConfigurableGatewayId) => id.toUpperCase() as Gateway;

/** Só os campos conhecidos do gateway, com valor de texto não vazio. */
function cleanFields(id: ConfigurableGatewayId, value: unknown): GatewayFieldValues {
  const clean: GatewayFieldValues = {};
  if (!value || typeof value !== 'object') return clean;
  for (const field of GATEWAY_DEFS[id].fields) {
    const raw = (value as Record<string, unknown>)[field.name];
    if (typeof raw === 'string' && raw !== '') clean[field.name] = raw;
  }
  return clean;
}

let cache: { at: number; value: StoredGateways } | null = null;

export function invalidateStoredGateways(): void {
  cache = null;
}

export async function loadStoredGateways(now: number = Date.now()): Promise<StoredGateways> {
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const [campaign, rows] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { activeGateway: true } }),
    prisma.gatewayConfig.findMany(),
  ]);

  const value: StoredGateways = {
    active: campaign?.activeGateway ? toId(campaign.activeGateway) : null,
    fields: { mercadopago: {}, fastpay: {}, ironpay: {} },
  };
  for (const row of rows) {
    const id = toId(row.gateway);
    if (!id) continue;
    try {
      value.fields[id] = cleanFields(id, JSON.parse(decryptGatewaySecrets(row.secretsEnc)));
    } catch {
      // Chave de cifra trocada ou linha corrompida: o gateway fica como "sem credenciais do painel".
      console.error(`[gateways] não foi possível ler as credenciais salvas de ${id}.`);
    }
  }
  cache = { at: now, value };
  return value;
}

/** Texto cifrado pronto para a coluna `secretsEnc`; `null` quando não sobra nenhum campo. */
export function sealGatewayFields(id: ConfigurableGatewayId, fields: GatewayFieldValues): string | null {
  const clean = cleanFields(id, fields);
  return Object.keys(clean).length === 0 ? null : encryptGatewaySecrets(JSON.stringify(clean));
}
