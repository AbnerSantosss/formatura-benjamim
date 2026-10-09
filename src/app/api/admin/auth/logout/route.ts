import { assertSameOrigin } from '@/server/auth/csrf';
import { destroySession } from '@/server/auth/session';
import { fail, json } from '@/server/http';

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await destroySession();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
