import { updateProduct } from '@/server/admin.service';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

// PATCH { title?, description?, active?, unitCents? } — o preço só muda sem pedido aprovado.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { id } = await params;
    return json({ product: await updateProduct(id, await readJson(req), admin.id) });
  } catch (error) {
    return fail(error);
  }
}
