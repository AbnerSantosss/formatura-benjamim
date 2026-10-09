import { assertSameOrigin } from '@/server/auth/csrf';
import { resendInvite } from '@/server/auth/invites';
import { requireAdmin } from '@/server/auth/require-admin';
import { prisma } from '@/server/db';
import { ForbiddenError } from '@/server/errors';
import { fail, json, tooManyRequests } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';

export const dynamic = 'force-dynamic';

/** 3 reenvios a cada 10 minutos por convidado. */
const RESEND_LIMIT = { limit: 3, windowMs: 10 * 60_000 };

// Gera um link novo (o anterior deixa de valer) e reenvia o e-mail de convite.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const { id } = await params;

    // Mesma regra do convite: só OWNER mexe em convite de OWNER.
    const target = await prisma.adminUser.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === 'OWNER' && admin.role !== 'OWNER') throw new ForbiddenError();

    const limit = rateLimit(`admin:reenviar-convite:${id}`, RESEND_LIMIT);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

    const result = await resendInvite(id, { id: admin.id, name: admin.name });
    return json({ admin: result.admin, emailSent: result.emailSent });
  } catch (error) {
    return fail(error);
  }
}
