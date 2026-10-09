import { requireAdmin } from '@/server/auth/require-admin';
import { fail, json } from '@/server/http';

export async function GET() {
  try {
    // Com troca de senha pendente a rota ainda responde: a tela precisa do `mustChangePassword`.
    const { admin } = await requireAdmin({ allowPasswordChangePending: true });
    return json({ admin });
  } catch (error) {
    return fail(error);
  }
}
