import { getOrder } from '@/server/admin.service';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

// Detalhe do pedido: números, cobrança (sem a resposta crua do provedor) e auditoria.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    return json({ order: await getOrder(id, new Date()) });
  } catch (error) {
    return fail(error);
  }
}
