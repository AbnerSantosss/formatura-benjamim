import { fail, getClientIp, json, tooManyRequests } from '@/server/http';
import { getCampaignSummary } from '@/server/orders.service';
import { RATE_LIMITS, rateLimit } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const limit = rateLimit(`campanha:${getClientIp(req)}`, RATE_LIMITS.publicGet);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

    // Resumo público: só totais. Valores pendentes/estornados e contagem de pedidos ficam no painel.
    const summary = await getCampaignSummary(new Date());
    return json(
      {
        raisedCents: summary.raisedCents,
        goalCents: summary.goalCents,
        numbersSold: summary.numbersSold,
        numbersAvailable: summary.numbersAvailable,
        drawAt: summary.drawAt,
        drawPublic: summary.drawPublic,
        ...(summary.winner ? { winner: summary.winner } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return fail(error);
  }
}
