import { audit } from '@/server/audit';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json } from '@/server/http';
import { expireStaleOrders } from '@/server/orders.service';

export const dynamic = 'force-dynamic';

// "Rodar expiração agora": marca como EXPIRED os pendentes vencidos e libera os números.
export async function POST(req: Request) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const expired = await expireStaleOrders(new Date());
    await audit('orders.expired_manually', { actorId: admin.id, meta: { expired } });
    return json({ expired });
  } catch (error) {
    return fail(error);
  }
}
