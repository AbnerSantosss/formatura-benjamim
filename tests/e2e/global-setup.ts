// Roda uma vez antes do E2E: cria os dois administradores de teste no banco do servidor em teste.
// As senhas são geradas aqui, vivem só na memória (variáveis de ambiente deste processo e dos
// workers do Playwright) e nunca são impressas nem gravadas em arquivo.
import { randomBytes } from 'node:crypto';
import { createAdmin } from '../../scripts/admin-create';
import { E2E_EMAIL_DOMAIN, E2E_EMAIL_PREFIX, e2ePrisma, removeE2eAdmins } from './support/db';

/** Atende à política do painel: 10+ caracteres, com letra e número. */
function randomPassword(): string {
  return `E2e${randomBytes(18).toString('base64url')}9a`;
}

export default async function globalSetup(): Promise<void> {
  // E-mail novo a cada execução: o login tem limite de 5 tentativas a cada 15 minutos POR E-MAIL,
  // e um e-mail fixo travaria execuções repetidas.
  const run = randomBytes(4).toString('hex');
  const ownerEmail = `${E2E_EMAIL_PREFIX}admin+${run}${E2E_EMAIL_DOMAIN}`;
  const helperEmail = `${E2E_EMAIL_PREFIX}ajudante+${run}${E2E_EMAIL_DOMAIN}`;
  const ownerPassword = randomPassword();
  const helperPassword = randomPassword();

  const prisma = e2ePrisma();
  try {
    // Sobras de uma execução interrompida saem antes de começar.
    await removeE2eAdmins(prisma);
    // Proprietário com senha temporária: o primeiro login cai na troca de senha obrigatória.
    await createAdmin(prisma, {
      email: ownerEmail,
      name: 'Admin E2E',
      password: ownerPassword,
      role: 'OWNER',
      mustChangePassword: true,
    });
    // Administrador comum, com senha própria: serve para conferir a visão do papel ADMIN.
    await createAdmin(prisma, {
      email: helperEmail,
      name: 'Ajudante E2E',
      password: helperPassword,
      role: 'ADMIN',
      mustChangePassword: false,
    });
  } finally {
    await prisma.$disconnect();
  }

  process.env.E2E_OWNER_EMAIL = ownerEmail;
  process.env.E2E_OWNER_PASSWORD = ownerPassword;
  process.env.E2E_HELPER_EMAIL = helperEmail;
  process.env.E2E_HELPER_PASSWORD = helperPassword;
}
