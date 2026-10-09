import { assertSameOrigin } from '@/server/auth/csrf';
import { authErrorResponse } from '@/server/auth/require-admin';
import { destroySession } from '@/server/auth/session';

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await destroySession();
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
