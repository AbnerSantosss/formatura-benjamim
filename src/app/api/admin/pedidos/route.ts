import { listOrders, orderFiltersFromSearch } from '@/server/admin.service';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

// GET /api/admin/pedidos?q&status&mode&page → { items, page, pageSize, total }
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const filters = orderFiltersFromSearch(new URL(req.url).searchParams);
    return json(await listOrders(filters, new Date()));
  } catch (error) {
    return fail(error);
  }
}
