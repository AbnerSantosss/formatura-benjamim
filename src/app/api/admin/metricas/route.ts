import { metrics } from '@/server/admin.service';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return json(await metrics(new Date()));
  } catch (error) {
    return fail(error);
  }
}
