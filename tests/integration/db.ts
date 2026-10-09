// Utilitários de banco para os testes de integração (qualquer tarefa pode usar).
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/server/db';
import { assertTestDatabase } from './test-env';

export function testPrisma(): PrismaClient {
  return prisma;
}

/**
 * Esvazia todas as tabelas do schema público, inclusive as criadas por migrações futuras.
 * Só preserva o histórico de migrações do Prisma.
 */
export async function truncateAll(): Promise<void> {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Campanha `main` e os dois produtos do catálogo, como no seed (ADR 009). */
export async function seedCatalog(): Promise<void> {
  await prisma.campaign.create({
    data: {
      id: 'main',
      goalCents: 250000,
      costsCents: 0,
      totalNumbers: 5000,
      numberUnitCents: 50,
      reservationMin: 10,
    },
  });
  await prisma.product.createMany({
    data: [
      {
        id: 'cestas-boticario',
        title: 'Cestas O Boticário',
        description: 'Cestas masculina e feminina.',
        mode: 'NUMBERS',
        unitCents: 50,
        sortOrder: 1,
      },
      {
        id: 'colaboracao-avulsa',
        title: 'Colaboração avulsa',
        description: 'Valor livre a partir de R$ 5.',
        mode: 'EXTRA',
        unitCents: 0,
        sortOrder: 2,
      },
    ],
  });
}
