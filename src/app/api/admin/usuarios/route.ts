import { z } from 'zod';
import { listAdmins } from '@/server/admin.service';
import { assertSameOrigin } from '@/server/auth/csrf';
import { inviteAdmin } from '@/server/auth/invites';
import { requireAdmin } from '@/server/auth/require-admin';
import { ForbiddenError } from '@/server/errors';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return json({ items: await listAdmins() });
  } catch (error) {
    return fail(error);
  }
}

const inviteBodySchema = z.object({
  name: z.string({ error: 'Informe o nome.' }),
  email: z.string({ error: 'Informe o e-mail.' }),
  role: z.enum(['OWNER', 'ADMIN'], { error: 'Papel inválido.' }).default('ADMIN'),
});

// Convite: cria o usuário sem senha e envia o link por e-mail. O token nunca volta na resposta.
export async function POST(req: Request) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const input = inviteBodySchema.parse(await readJson(req));
    // Só OWNER cria outro OWNER; ADMIN convida apenas ADMIN.
    if (input.role === 'OWNER' && admin.role !== 'OWNER') throw new ForbiddenError();
    const result = await inviteAdmin(input, { id: admin.id, name: admin.name });
    return json({ admin: result.admin, emailSent: result.emailSent });
  } catch (error) {
    return fail(error);
  }
}
