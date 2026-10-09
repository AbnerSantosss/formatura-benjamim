import { authErrorResponse, requireAdmin } from '@/server/auth/require-admin';

export async function GET() {
  try {
    // Com troca de senha pendente a rota ainda responde: a tela precisa do `mustChangePassword`.
    const { admin } = await requireAdmin({ allowPasswordChangePending: true });
    return Response.json({ admin });
  } catch (error) {
    return authErrorResponse(error);
  }
}
