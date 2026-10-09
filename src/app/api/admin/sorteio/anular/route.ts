import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { annulDraw } from '@/server/draw.service';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ reason: z.unknown() });

// Anula o sorteio válido. Só OWNER, com motivo; o registro anulado continua no banco.
export async function POST(req: Request) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { reason } = bodySchema.parse(await readJson(req));
    return json({ state: await annulDraw({ actorId: admin.id, role: admin.role, reason }) });
  } catch (error) {
    return fail(error);
  }
}
