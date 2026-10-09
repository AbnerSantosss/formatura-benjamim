import 'server-only';
import { z } from 'zod';
import { CONFIGURABLE_GATEWAY_IDS, GATEWAY_DEFS, type ConfigurableGatewayId } from '@/domain/gateway-fields';
import { audit } from '@/server/audit';
import { prisma } from '@/server/db';
import { NotFoundError, ValidationError } from '@/server/errors';
import { gatewaySettings, isGatewayConfiguredWith, type GatewaySettings } from './registry';
import {
  invalidateStoredGateways,
  loadStoredGateways,
  sealGatewayFields,
  toGatewayEnum,
  type GatewayFieldValues,
} from './stored-config';

// Configuração dos gateways pelo painel (ADR 015). As credenciais entram por aqui, são cifradas e
// nunca voltam: a leitura devolve só "preenchido ou não" (e o valor dos campos que não são segredo).

const CAMPAIGN_ID = 'main';

export type AdminGatewaySettings = GatewaySettings;

export const getGatewaySettings = (): Promise<AdminGatewaySettings> => gatewaySettings();

const updateSchema = z.object({
  gateway: z.enum(CONFIGURABLE_GATEWAY_IDS as [ConfigurableGatewayId, ...ConfigurableGatewayId[]], {
    error: 'Gateway desconhecido.',
  }),
  // Texto define o campo; null ou vazio apaga o que foi salvo no painel (volta a valer o ambiente).
  fields: z
    .record(z.string(), z.union([z.null(), z.string().trim().max(500, { error: 'Valor longo demais.' })]))
    .optional(),
  activate: z.literal(true).optional(),
});

const httpsUrl = z.url({
  protocol: /^https$/,
  error: 'Informe o endereço completo, começando com https://.',
});

export async function updateGatewaySettings(input: unknown, actorId: string): Promise<AdminGatewaySettings> {
  const data = updateSchema.parse(input);
  const def = GATEWAY_DEFS[data.gateway];
  const changes = Object.entries(data.fields ?? {});
  if (changes.length === 0 && !data.activate) throw new ValidationError('Nada para alterar.');

  // Sempre a partir do banco, não do cache: evita gravar por cima de uma alteração recente.
  invalidateStoredGateways();
  const next: GatewayFieldValues = { ...(await loadStoredGateways()).fields[data.gateway] };
  const changed: string[] = [];
  for (const [name, value] of changes) {
    const field = def.fields.find((item) => item.name === name);
    if (!field) throw new ValidationError(`Campo desconhecido para ${def.label}.`);
    if (value === null || value === '') {
      delete next[name];
    } else {
      if (field.url) {
        const parsed = httpsUrl.safeParse(value);
        if (!parsed.success)
          throw new ValidationError(`${field.label}: informe um endereço https:// completo.`);
      }
      next[name] = value;
    }
    changed.push(name);
  }

  if (data.activate) {
    // Conferido antes de gravar, já com os campos novos (painel por cima do ambiente).
    if (!def.implemented) {
      throw new ValidationError(
        `A integração com ${def.label} ainda não está pronta. As chaves ficam guardadas, mas ele não pode ser ativado.`,
      );
    }
    if (!isGatewayConfiguredWith(data.gateway, next)) {
      throw new ValidationError(`Preencha as credenciais de ${def.label} antes de ativar.`);
    }
  }

  const gateway = toGatewayEnum(data.gateway);
  await prisma.$transaction(async (tx) => {
    if (changed.length > 0) {
      const secretsEnc = sealGatewayFields(data.gateway, next);
      if (secretsEnc === null) {
        await tx.gatewayConfig.deleteMany({ where: { gateway } });
      } else {
        await tx.gatewayConfig.upsert({
          where: { gateway },
          create: { gateway, secretsEnc, updatedById: actorId },
          update: { secretsEnc, updatedById: actorId },
        });
      }
    }
    if (data.activate) {
      const existing = await tx.campaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { id: true } });
      if (!existing) throw new NotFoundError('Campanha não configurada.');
      await tx.campaign.update({ where: { id: CAMPAIGN_ID }, data: { activeGateway: gateway } });
    }
    // Só o nome dos campos mexidos; valor nenhum.
    await audit(
      'gateway.updated',
      { actorId, meta: { gateway: data.gateway, changed, activated: Boolean(data.activate) } },
      tx,
    );
  });
  invalidateStoredGateways();

  return gatewaySettings();
}
