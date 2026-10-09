import { z } from 'zod';
import { listProducts, updateProduct } from '@/server/admin.service';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return json({ items: await listProducts() });
  } catch (error) {
    return fail(error);
  }
}

const bodySchema = z.looseObject({
  id: z.string({ error: 'Informe o produto.' }).trim().min(1).max(64),
});

// PATCH /api/admin/produtos com `{ id, ...campos }`: mesmo efeito de PATCH /api/admin/produtos/[id].
export async function PATCH(req: Request) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { id, ...changes } = bodySchema.parse(await readJson(req));
    return json({ product: await updateProduct(id, changes, admin.id) });
  } catch (error) {
    return fail(error);
  }
}
