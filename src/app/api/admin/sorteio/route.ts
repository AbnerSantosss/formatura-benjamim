import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { getDrawState, performDraw } from '@/server/draw.service';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ force: z.boolean({ error: 'Valor inválido.' }).optional() });

// Estado do sorteio para o painel. Traz nome, e-mail e telefone do ganhador: só com sessão de admin.
export async function GET(req: Request) {
  try {
    await requireAdmin();
    assertSameOrigin(req);
    return json({ state: await getDrawState(new Date()) });
  } catch (error) {
    return fail(error);
  }
}

// Sorteia o ganhador. `force` (só OWNER) permite sortear antes da data configurada.
export async function POST(req: Request) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { force } = bodySchema.parse(await readJson(req));
    const result = await performDraw({ actorId: admin.id, role: admin.role, force, now: new Date() });
    return json(result);
  } catch (error) {
    return fail(error);
  }
}
