// Cria (ou atualiza) um administrador do painel. Uso: `npm run admin:create`.
//
// Lê ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_NAME e ADMIN_BOOTSTRAP_PASSWORD do ambiente (.env).
// Argumentos: --email <e-mail>  --name <nome>  --role OWNER|ADMIN (padrão OWNER)  --force
// Sem senha no ambiente, pergunta no terminal sem eco.
//
// REGRA: este script nunca imprime a senha, nem em mensagem de erro.
// Não importa `src/server/db.ts` nem `src/server/env.ts` porque `server-only` só funciona dentro do Next.
import path from 'node:path';
import { PrismaClient, type AdminRole } from '@prisma/client';
import { hashPassword, passwordPolicy } from '../src/server/auth/password';

export type CreateAdminInput = {
  email: string;
  name: string;
  password: string;
  role?: AdminRole;
  /** Sobrescreve a senha de um admin que já aceitou o acesso. */
  force?: boolean;
  /** `true` quando a senha veio do ambiente: o admin troca no primeiro login. */
  mustChangePassword: boolean;
};

export type CreateAdminResult = {
  status: 'created' | 'updated' | 'kept';
  id: string;
  role: AdminRole;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `upsert` por e-mail. Admin que já tem `acceptedAt` não é alterado sem `force` (status `kept`).
 * Lança `Error` com mensagem em português se e-mail, nome ou senha forem inválidos.
 */
export async function createAdmin(prisma: PrismaClient, input: CreateAdminInput): Promise<CreateAdminResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const role: AdminRole = input.role ?? 'OWNER';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail do administrador inválido.');
  if (name.length < 2) throw new Error('Informe o nome do administrador.');
  const policy = passwordPolicy.safeParse(input.password);
  if (!policy.success) {
    throw new Error(policy.error.issues[0]?.message ?? 'A senha não atende à política.');
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing?.acceptedAt && !input.force) {
    return { status: 'kept', id: existing.id, role: existing.role };
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  if (!existing) {
    const created = await prisma.adminUser.create({
      data: {
        email,
        name,
        role,
        passwordHash,
        acceptedAt: now,
        mustChangePassword: input.mustChangePassword,
      },
    });
    return { status: 'created', id: created.id, role: created.role };
  }

  const [updated] = await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: existing.id },
      data: {
        name,
        role,
        passwordHash,
        acceptedAt: now,
        mustChangePassword: input.mustChangePassword,
        ...(input.force ? { disabledAt: null } : {}),
      },
    }),
    // Senha trocada por fora: as sessões antigas deixam de valer.
    prisma.session.deleteMany({ where: { userId: existing.id } }),
  ]);
  return { status: 'updated', id: updated.id, role: updated.role };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}***@${domain ?? ''}`;
}

function parseArgs(argv: string[]): { email?: string; name?: string; role?: string; force: boolean } {
  const out: { email?: string; name?: string; role?: string; force: boolean } = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') out.force = true;
    else if (arg === '--email') out.email = argv[(i += 1)];
    else if (arg === '--name') out.name = argv[(i += 1)];
    else if (arg === '--role') out.role = argv[(i += 1)];
    else throw new Error(`Argumento desconhecido: ${arg}. Use --email, --name, --role OWNER|ADMIN, --force.`);
  }
  return out;
}

/** Lê uma linha do terminal sem mostrar o que é digitado. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return Promise.reject(
      new Error('Sem terminal interativo para digitar a senha. Defina ADMIN_BOOTSTRAP_PASSWORD no .env.'),
    );
  }
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('Cancelado.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  try {
    // Carrega o .env quando roda fora do Next. Variáveis já definidas no ambiente têm prioridade.
    process.loadEnvFile();
  } catch {
    // Sem arquivo .env (CI, container): as variáveis vêm do ambiente.
  }

  const args = parseArgs(process.argv.slice(2));
  const email = args.email ?? process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() ?? '';
  const name = args.name ?? process.env.ADMIN_BOOTSTRAP_NAME?.trim() ?? '';
  const role = (args.role ?? 'OWNER').toUpperCase();

  if (!email) throw new Error('Defina ADMIN_BOOTSTRAP_EMAIL no .env ou passe --email.');
  if (!name) throw new Error('Defina ADMIN_BOOTSTRAP_NAME no .env ou passe --name.');
  if (role !== 'OWNER' && role !== 'ADMIN') throw new Error('--role deve ser OWNER ou ADMIN.');

  const envPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const fromEnv = envPassword.trim() !== '';
  const password = fromEnv ? envPassword : await promptHidden('Senha do administrador (não aparece): ');

  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const result = await createAdmin(prisma, {
      email,
      name,
      password,
      role,
      force: args.force,
      // Senha vinda do ambiente é temporária; senha digitada na hora já é a definitiva.
      mustChangePassword: fromEnv,
    });
    const who = `${result.role} ${maskEmail(normalizeEmail(email))}`;
    if (result.status === 'kept') {
      console.log(
        `Administrador ${who} já existe e já tem senha própria. Nada foi alterado (use --force para redefinir).`,
      );
    } else {
      const verb = result.status === 'created' ? 'criado' : 'atualizado';
      const note = fromEnv ? ' A senha do .env é temporária: será trocada no primeiro login.' : '';
      console.log(`Administrador ${who} ${verb}.${note}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Só executa quando chamado direto (tsx scripts/admin-create.ts); em testes só `createAdmin` é importada.
if (path.basename(process.argv[1] ?? '').startsWith('admin-create')) {
  main().catch((error: unknown) => {
    // Só a mensagem: nunca o objeto de erro inteiro nem variáveis de ambiente.
    console.error('admin:create falhou:', error instanceof Error ? error.message : 'erro desconhecido');
    process.exitCode = 1;
  });
}
