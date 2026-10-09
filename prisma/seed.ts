// Seed idempotente: cria a campanha e os dois produtos do catálogo se ainda não existirem.
// Rodar de novo não duplica nem sobrescreve o que o painel já editou (o `update` é vazio).
// Não importa `src/server/db.ts` porque `server-only` só funciona dentro do Next.
// Nunca imprimir variáveis de ambiente aqui.
import { PrismaClient } from '@prisma/client';

try {
  // Carrega o .env quando o script roda fora do Next. Variáveis já definidas no ambiente têm prioridade.
  process.loadEnvFile();
} catch {
  // Sem arquivo .env (CI, container): as variáveis vêm do ambiente.
}

const prisma = new PrismaClient({ log: ['error'] });

function centsFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro em centavos, maior ou igual a zero.`);
  }
  return value;
}

async function main() {
  const campaign = await prisma.campaign.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      goalCents: centsFromEnv('CAMPAIGN_GOAL_CENTS', 250000),
      costsCents: centsFromEnv('CAMPAIGN_COSTS_CENTS', 0),
      totalNumbers: 5000,
      numberUnitCents: 50,
      reservationMin: 10,
      instagramFather: process.env.INSTAGRAM_FATHER_URL?.trim() ?? '',
      instagramMother: process.env.INSTAGRAM_MOTHER_URL?.trim() ?? '',
      drawPublic: false,
    },
  });

  const products = [
    {
      id: 'cestas-boticario',
      title: 'Cestas O Boticário',
      description:
        'Cestas masculina e feminina. Seleção de números em uma demonstração sem cobrança ou sorteio real.',
      mode: 'NUMBERS' as const,
      unitCents: 50,
      sortOrder: 1,
      active: true,
    },
    {
      id: 'colaboracao-avulsa',
      title: 'Colaboração avulsa',
      description: 'Valor livre a partir de R$ 5, sem números ou participação no sorteio.',
      mode: 'EXTRA' as const,
      unitCents: 0,
      sortOrder: 2,
      active: true,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({ where: { id: product.id }, update: {}, create: product });
  }

  const totalCampaigns = await prisma.campaign.count();
  const totalProducts = await prisma.product.count();
  console.log(
    `Seed concluído: campanha "${campaign.id}" (${totalCampaigns} no banco), ${totalProducts} produtos no banco.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed falhou:', error instanceof Error ? error.message : 'erro desconhecido');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
