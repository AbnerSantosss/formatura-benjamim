// Roda uma vez depois do E2E: remove os administradores de teste (os do setup e os convidados pela
// tela), com suas sessões e tokens. Os pedidos "Contribuinte E2E" ficam no banco de propósito.
import { e2ePrisma, removeE2eAdmins } from './support/db';

export default async function globalTeardown(): Promise<void> {
  const prisma = e2ePrisma();
  try {
    await removeE2eAdmins(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
