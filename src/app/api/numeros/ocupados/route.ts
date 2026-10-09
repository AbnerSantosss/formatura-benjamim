import { TOTAL_NUMBERS } from '@/domain/orders';
import { fail, getClientIp, json, tooManyRequests } from '@/server/http';
import { getOccupiedNumbers } from '@/server/orders.service';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const limit = rateLimit(`ocupados:${getClientIp(req)}`, RATE_LIMITS.publicGet);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

    const occupied = await getOccupiedNumbers(new Date());
    return json({ occupied, total: TOTAL_NUMBERS }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return fail(error);
  }
}
