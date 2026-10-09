import { z } from 'zod';
import { deactivateAdmin, reactivateAdmin } from '@/server/admin.service';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ active: z.boolean({ error: 'Informe `active` (true ou false).' }) });

// PATCH { active: false } desativa o acesso; { active: true } devolve. As regras (só OWNER, não a si
// mesmo, nunca o último OWNER ativo) ficam no serviço.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { id } = await params;
    const { active } = bodySchema.parse(await readJson(req));
    const actor = { id: admin.id, role: admin.role };
    const user = active ? await reactivateAdmin(id, actor) : await deactivateAdmin(id, actor);
    return json({ admin: user });
  } catch (error) {
    return fail(error);
  }
}
